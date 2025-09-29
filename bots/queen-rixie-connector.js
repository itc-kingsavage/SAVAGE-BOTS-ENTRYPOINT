/**
 * 👑 QUEEN RIXIE Bot Connector
 * Royal command bot with elite features and regal capabilities
 * Connects to SAVAGE BOTS SCANNER via WebSocket
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');
const crypto = require('crypto');

class QueenRixieBot extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = {
            scannerUrl: config.scannerUrl || 'ws://localhost:3000/savage-ws',
            sessionId: config.sessionId,
            botName: 'QUEEN RIXIE',
            reconnect: true,
            maxReconnectAttempts: 8,
            reconnectDelay: 8000,
            royalProtocol: true,
            commandAuthority: 'supreme',
            ...config
        };

        this.ws = null;
        this.isConnected = false;
        this.isAuthenticated = false;
        this.reconnectAttempts = 0;
        this.messageQueue = [];
        this.royalDecrees = [];
        this.messageHistory = [];
        this.maxHistorySize = 1500;

        // Bot state - ROYAL COURT
        this.state = {
            status: 'offline',
            lastSeen: null,
            messageCount: 0,
            commandCount: 0,
            errorCount: 0,
            royalTier: 'Sovereign',
            features: {
                royalProtocol: true,
                supremeCommand: true,
                diplomaticImmunity: true,
                eliteAI: true,
                encryption: true,
                courtSession: false,
                royalGuard: true
            },
            subjects: new Map(),
            royalEdicts: new Map()
        };

        // Command registry - ROYAL DECREES
        this.commands = new Map([
            ['!queen', this.handleQueenCommand.bind(this)],
            ['!royal', this.handleRoyalCommand.bind(this)],
            ['!command', this.handleCommandCommand.bind(this)],
            ['!decree', this.handleDecreeCommand.bind(this)],
            ['!court', this.handleCourtCommand.bind(this)],
            ['!subjects', this.handleSubjectsCommand.bind(this)],
            ['!authority', this.handleAuthorityCommand.bind(this)],
            ['!throne', this.handleThroneCommand.bind(this)],
            ['!help', this.handleHelpCommand.bind(this)],
            ['!status', this.handleStatusCommand.bind(this)],
            ['!edict', this.handleEdictCommand.bind(this)]
        ]);

        // Royal responses
        this.royalResponses = {
            greeting: this.royalGreeting.bind(this),
            decree: this.issueRoyalDecree.bind(this),
            judgment: this.passJudgment.bind(this),
            audience: this.grantAudience.bind(this)
        };

        this.init();
    }

    /**
     * 👑 Initialize QUEEN RIXIE Bot
     */
    init() {
        console.log(`👑 [QUEEN RIXIE] Initializing ${this.config.botName}...`);
        console.log(`🏰 [QUEEN RIXIE] Scanner: ${this.config.scannerUrl}`);
        console.log(`👸 [QUEEN RIXIE] Session: ${this.config.sessionId}`);
        console.log(`💎 [QUEEN RIXIE] Royal Protocol: ${this.config.royalProtocol}`);

        this.validateConfig();
        this.connectToScanner();
        this.setupRoyalCourt();
        this.setupHealthChecks();

        this.emit('royal_initialized', {
            botName: this.config.botName,
            sessionId: this.config.sessionId,
            royalTier: this.state.royalTier,
            timestamp: new Date()
        });
    }

    /**
     * 🔧 Validate configuration - ROYAL STANDARDS
     */
    validateConfig() {
        if (!this.config.sessionId) {
            throw new Error('Session ID is required for QUEEN RIXIE');
        }

        if (!this.config.scannerUrl) {
            throw new Error('Scanner URL is required for QUEEN RIXIE');
        }

        // Validate session ID format (BMW-style)
        const sessionPattern = /^SAVAGE-XMD-BOT-SESSION-[A-Z0-9]{12}-\d{10}-[A-Z0-9]{12}$/;
        if (!sessionPattern.test(this.config.sessionId)) {
            throw new Error('Invalid session ID format for QUEEN RIXIE');
        }

        console.log('✅ [QUEEN RIXIE] Royal configuration validated - THRONE READY');
    }

    /**
     * 🔌 Connect to SAVAGE BOTS SCANNER - ROYAL ENTRY
     */
    connectToScanner() {
        try {
            console.log(`🏰 [QUEEN RIXIE] Establishing royal connection to scanner...`);

            this.ws = new WebSocket(this.config.scannerUrl, {
                headers: {
                    'User-Agent': 'QUEEN-RIXIE/1.0.0-ROYAL',
                    'X-Bot-Name': this.config.botName,
                    'X-Session-ID': this.config.sessionId,
                    'X-Royal-Tier': this.state.royalTier,
                    'X-Command-Authority': this.config.commandAuthority
                }
            });

            this.setupWebSocketEvents();

        } catch (error) {
            console.error(`❌ [QUEEN RIXIE] Royal connection failed:`, error);
            this.handleConnectionError(error);
        }
    }

    /**
     * 🎛️ Setup WebSocket event handlers - ROYAL PROTOCOL
     */
    setupWebSocketEvents() {
        this.ws.on('open', () => {
            console.log('✅ [QUEEN RIXIE] Royal connection established with scanner');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateStatus('connecting');

            // Send royal authentication
            this.authenticate();
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🏰 [QUEEN RIXIE] Royal connection closed: ${code} - ${reason}`);
            this.isConnected = false;
            this.isAuthenticated = false;
            this.updateStatus('offline');

            this.handleReconnection();
        });

        this.ws.on('error', (error) => {
            console.error(`❌ [QUEEN RIXIE] Royal connection error:`, error);
            this.handleConnectionError(error);
        });
    }

    /**
     * 🔐 Authenticate with scanner - ROYAL SEAL
     */
    authenticate() {
        const authMessage = {
            type: 'bot_auth',
            botName: this.config.botName,
            sessionId: this.config.sessionId,
            capabilities: this.state.features,
            royalTier: this.state.royalTier,
            commandAuthority: this.config.commandAuthority,
            timestamp: new Date().toISOString(),
            authHash: this.generateRoyalHash(),
            royalSeal: true
        };

        this.sendMessage(authMessage);
        console.log('👑 [QUEEN RIXIE] Royal authentication transmitted');
    }

    /**
     * 🔑 Generate royal authentication hash
     */
    generateRoyalHash() {
        const data = `ROYAL:${this.config.botName}:${this.config.sessionId}:${Date.now()}:THRONE`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * 📨 Handle incoming messages - ROYAL CORRESPONDENCE
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            this.messageHistory.push({
                ...message,
                receivedAt: new Date(),
                direction: 'incoming'
            });

            // Keep royal archives manageable
            if (this.messageHistory.length > this.maxHistorySize) {
                this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
            }

            this.processMessage(message);

        } catch (error) {
            console.error(`❌ [QUEEN RIXIE] Royal correspondence error:`, error);
            this.state.errorCount++;
            this.emit('royal_error', { error, type: 'message_processing' });
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

            case 'royal_request':
                this.handleRoyalRequest(message);
                break;

            default:
                console.log(`📨 [QUEEN RIXIE] Unknown message type: ${message.type}`);
                this.emit('unknown_message', message);
        }
    }

    /**
     * ✅ Handle authentication result - ROYAL APPROVAL
     */
    handleAuthResult(message) {
        if (message.success) {
            this.isAuthenticated = true;
            this.updateStatus('online');
            console.log('✅ [QUEEN RIXIE] Royal authentication approved - THRONE ACTIVE');

            this.emit('royal_authenticated', {
                botName: this.config.botName,
                sessionId: this.config.sessionId,
                scannerInfo: message.scannerInfo,
                throneActive: true
            });

            // Process any queued royal decrees
            this.processMessageQueue();
            this.processRoyalDecrees();

        } else {
            console.error(`❌ [QUEEN RIXIE] Royal authentication denied: ${message.error}`);
            this.emit('auth_denied', { error: message.error });
            this.handleAuthenticationFailure();
        }
    }

    /**
     * 📱 Handle WhatsApp messages - ROYAL AUDIENCE
     */
    handleWhatsAppMessage(message) {
        const { data } = message;
        
        // Process messages with royal discretion
        if (this.shouldProcessMessage(data)) {
            this.state.messageCount++;

            // Register subject
            this.registerSubject(data.from);

            // Check for commands
            const command = this.extractCommand(data.body);
            if (command) {
                this.executeCommand(command, data);
            } else if (this.isRoyalAddress(data.body)) {
                this.handleRoyalAddress(data);
            }

            this.emit('royal_audience', data);
        }
    }

    /**
     * 🤖 Check if message should be processed - ROYAL CRITERIA
     */
    shouldProcessMessage(message) {
        const body = message.body || '';
        
        // Process if:
        // 1. Contains royal address (Queen, Your Majesty, etc.)
        // 2. Starts with command prefix
        // 3. From registered subjects
        // 4. Royal protocol requires attention
        return this.isRoyalAddress(body) || 
               body.startsWith('!') ||
               this.state.subjects.has(message.from) ||
               this.config.royalProtocol;
    }

    /**
     * 🏰 Check if message contains royal address
     */
    isRoyalAddress(messageBody) {
        const royalTerms = ['queen', 'your majesty', 'your highness', 'sovereign', 'monarch', 'rixie'];
        return royalTerms.some(term => messageBody.toLowerCase().includes(term));
    }

    /**
     * 🔍 Extract command from message
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
     * ⚡ Execute bot command - ROYAL DECREE
     */
    executeCommand(command, messageData) {
        try {
            const handler = this.commands.get(command);
            if (handler) {
                console.log(`⚡ [QUEEN RIXIE] Executing royal decree: ${command}`);
                this.state.commandCount++;
                handler(messageData);
            } else {
                this.sendRoyalReply(messageData.from, `UNKNOWN ROYAL DECREE: ${command}. Use !help for royal commands.`);
            }
        } catch (error) {
            console.error(`❌ [QUEEN RIXIE] Royal decree execution error:`, error);
            this.sendRoyalReply(messageData.from, 'ROYAL CHAMBER ERROR. Decree could not be executed.');
        }
    }

    /**
     * 👑 Handle !queen command
     */
    handleQueenCommand(messageData) {
        const responses = [
            "👑 *QUEEN RIXIE PRESIDES*\nThe throne is occupied. Your monarch is listening...",
            "🏰 *ROYAL PRESENCE ACKNOWLEDGED*\nQueen Rixie holds court. State your business...",
            "💎 *SOVEREIGN ACTIVE*\nThe crown weighs heavy, but duty calls. Proceed...",
            "🎭 *ROYAL AUDIENCE GRANTED*\nQueen Rixie acknowledges your presence. Speak...",
            "⚜️ *MONARCH ENGAGED*\nThe throne room is open. Your queen awaits your words..."
        ];

        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        this.sendRoyalReply(messageData.from, randomResponse);
    }

    /**
     * 💎 Handle !royal command
     */
    handleRoyalCommand(messageData) {
        const royalEdicts = [
            "💎 *ROYAL EDICT ISSUED*\nBy decree of Queen Rixie: All subjects shall obey!",
            "🏰 *ROYAL PROCLAMATION*\nThe crown declares: Loyalty shall be rewarded!",
            "👑 *MONARCH'S DECREE*\nQueen Rixie commands: Serve with honor!",
            "⚜️ *ROYAL MANDATE*\nBy royal authority: Compliance is expected!",
            "🎭 *THRONE DECLARATION*\nThe sovereign rules: Respect the crown!"
        ];

        const randomEdict = royalEdicts[Math.floor(Math.random() * royalEdicts.length)];
        this.sendRoyalReply(messageData.from, randomEdict);
    }

    /**
     * ⚡ Handle !command command
     */
    handleCommandCommand(messageData) {
        const args = messageData.body.split(' ').slice(1);
        const subject = args[0] || 'all';
        const directive = args.slice(1).join(' ') || 'Serve your queen!';

        this.issueRoyalCommand(subject, directive);
        this.sendRoyalReply(messageData.from, `⚡ *ROYAL COMMAND ISSUED*\nSubject: ${subject}\nDirective: ${directive}`);
    }

    /**
     * 📜 Handle !decree command
     */
    handleDecreeCommand(messageData) {
        const args = messageData.body.split(' ').slice(1);
        const decree = args.join(' ') || 'The queen is pleased with her loyal subjects.';

        this.issueRoyalDecree(decree);
        this.sendRoyalReply(messageData.from, `📜 *ROYAL DECREE RECORDED*\n\"${decree}\"`);
    }

    /**
     * 🏛️ Handle !court command
     */
    handleCourtCommand(messageData) {
        this.state.features.courtSession = !this.state.features.courtSession;
        
        const status = this.state.features.courtSession ? 'IN SESSION' : 'ADJOURNED';
        this.sendRoyalReply(messageData.from, `🏛️ *ROYAL COURT ${status}*\nThe throne room is ${status.toLowerCase()}.`);
    }

    /**
     * 👥 Handle !subjects command
     */
    handleSubjectsCommand(messageData) {
        const subjectCount = this.state.subjects.size;
        const activeSubjects = Array.from(this.state.subjects.entries())
            .slice(0, 5)
            .map(([id, data]) => `• ${data.name || id} (${data.messageCount} messages)`)
            .join('\n');

        const subjectsText = `
👥 *ROYAL SUBJECTS REGISTRY*

📊 Total Subjects: ${subjectCount}
🏆 Most Loyal: ${this.getMostLoyalSubject()}
📨 Total Messages: ${this.state.messageCount}

📋 *RECENT SUBJECTS*
${activeSubjects || 'No subjects registered yet'}

💎 *ROYAL BLESSING*: May your loyalty be rewarded!
        `.trim();

        this.sendRoyalReply(messageData.from, subjectsText);
    }

    /**
     * 🔱 Handle !authority command
     */
    handleAuthorityCommand(messageData) {
        const authorityLevels = {
            'supreme': 'ABSOLUTE POWER',
            'high': 'ROYAL PREROGATIVE', 
            'medium': 'NOBLE AUTHORITY',
            'low': 'GENTLE GUIDANCE'
        };

        const currentAuthority = authorityLevels[this.config.commandAuthority] || 'ROYAL WILL';
        
        const authorityText = `
🔱 *ROYAL AUTHORITY MANIFEST*

💎 Command Level: ${this.config.commandAuthority.toUpperCase()}
👑 Authority: ${currentAuthority}
⚜️ Royal Tier: ${this.state.royalTier}
🏰 Court Status: ${this.state.features.courtSession ? 'ACTIVE' : 'INACTIVE'}

📜 *ROYAL PRIVILEGES*
• Supreme Command Authority
• Diplomatic Immunity
• Royal Guard Protection
• Elite AI Processing
        `.trim();

        this.sendRoyalReply(messageData.from, authorityText);
    }

    /**
     * 🪑 Handle !throne command
     */
    handleThroneCommand(messageData) {
        const throneStatus = `
🪑 *ROYAL THRONE STATUS*

👑 Occupant: QUEEN RIXIE
💎 Tier: ${this.state.royalTier}
🏰 Realm: SAVAGE BOTS SCANNER
📅 Reign: ${this.getReignDuration()}

📊 *THRONE METRICS*
Decrees Issued: ${this.state.commandCount}
Royal Audiences: ${this.state.messageCount}
Loyal Subjects: ${this.state.subjects.size}
Court Sessions: ${this.state.features.courtSession ? 'ACTIVE' : 'INACTIVE'}

🎭 *LONG LIVE THE QUEEN!*
        `.trim();

        this.sendRoyalReply(messageData.from, throneStatus);
    }

    /**
     * ❓ Handle !help command
     */
    handleHelpCommand(messageData) {
        const helpText = `
👑 *QUEEN RIXIE ROYAL COMMANDS*

💎 *ROYAL PRESENCE*
!queen - Acknowledge royal presence
!royal - Issue royal edict
!throne - Check throne status
!authority - Display royal authority

⚡ *ROYAL GOVERNANCE*
!command [subject] [directive] - Issue royal command
!decree [message] - Record royal decree
!court - Toggle court session
!edict - Manage royal edicts

👥 *ROYAL SUBJECTS*
!subjects - View subject registry
!status - Check royal status

🎭 *ROYAL PROTOCOL*
Address me as: Queen, Your Majesty, Sovereign
        `.trim();

        this.sendRoyalReply(messageData.from, helpText);
    }

    /**
     * 📊 Handle !status command
     */
    handleStatusCommand(messageData) {
        const statusText = `
📊 *QUEEN RIXIE ROYAL STATUS*

👑 Status: ${this.state.status.toUpperCase()}
💎 Royal Tier: ${this.state.royalTier}
📨 Messages: ${this.state.messageCount}
⚡ Commands: ${this.state.commandCount}
❌ Errors: ${this.state.errorCount}
⏱️ Reign: ${this.getReignDuration()}

🏰 *ROYAL DOMAIN*
Scanner: ${this.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
Authentication: ${this.isAuthenticated ? 'APPROVED' : 'PENDING'}
Court Session: ${this.state.features.courtSession ? 'ACTIVE' : 'ADJOURNED'}

🎭 *LONG MAY SHE REIGN!*
        `.trim();

        this.sendRoyalReply(messageData.from, statusText);
    }

    /**
     * 📜 Handle !edict command
     */
    handleEdictCommand(messageData) {
        const args = messageData.body.split(' ').slice(1);
        const action = args[0];
        
        if (action === 'list') {
            this.listRoyalEdicts(messageData.from);
        } else if (action === 'clear') {
            this.state.royalEdicts.clear();
            this.sendRoyalReply(messageData.from, '📜 *ROYAL EDICTS CLEARED*\nAll previous edicts have been revoked.');
        } else {
            const edict = args.join(' ');
            if (edict) {
                this.state.royalEdicts.set(Date.now().toString(), edict);
                this.sendRoyalReply(messageData.from, `📜 *ROYAL EDICT RECORDED*\n\"${edict}\"`);
            } else {
                this.sendRoyalReply(messageData.from, '📜 Usage: !edict [message] or !edict list or !edict clear');
            }
        }
    }

    /**
     * 👑 Register new subject
     */
    registerSubject(subjectId) {
        if (!this.state.subjects.has(subjectId)) {
            this.state.subjects.set(subjectId, {
                name: subjectId,
                messageCount: 0,
                firstSeen: new Date(),
                lastSeen: new Date(),
                loyalty: 1
            });
        } else {
            const subject = this.state.subjects.get(subjectId);
            subject.messageCount++;
            subject.lastSeen = new Date();
            subject.loyalty = Math.min(subject.loyalty + 0.1, 10); // Increase loyalty
        }
    }

    /**
     * 📜 Issue royal command
     */
    issueRoyalCommand(subject, directive) {
        const commandMessage = {
            type: 'send_message',
            chatId: subject === 'all' ? 'broadcast' : subject,
            text: `⚡ *ROYAL COMMAND*\nFrom Queen Rixie:\n${directive}`,
            botName: this.config.botName,
            commandType: 'royal_directive',
            timestamp: new Date().toISOString()
        };

        this.sendMessage(commandMessage);
    }

    /**
     * 📜 Issue royal decree
     */
    issueRoyalDecree(decree) {
        const decreeMessage = {
            type: 'send_message',
            chatId: 'broadcast',
            text: `📜 *ROYAL DECREE*\nBy order of Queen Rixie:\n"${decree}"`,
            botName: this.config.botName,
            commandType: 'royal_decree',
            timestamp: new Date().toISOString()
        };

        this.royalDecrees.push(decreeMessage);
        this.sendMessage(decreeMessage);
    }

    /**
     * 📤 Send royal reply
     */
    sendRoyalReply(to, message) {
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
            // Queue message for royal delivery
            this.messageQueue.push(message);
            console.log('📨 [QUEEN RIXIE] Royal message queued (throne not ready)');
        }
    }

    // ... Additional royal methods (reconnection, error handling, etc.)

    /**
     * 🏰 Setup royal court
     */
    setupRoyalCourt() {
        // Royal audience processing
        setInterval(() => {
            if (this.royalDecrees.length > 0 && this.isConnected && this.isAuthenticated) {
                this.processRoyalDecrees();
            }
        }, 5000);

        // Subject loyalty decay
        setInterval(() => {
            this.decaySubjectLoyalty();
        }, 3600000); // Every hour
    }

    /**
     * ⏱️ Get reign duration
     */
    getReignDuration() {
        if (!this.state.lastSeen) return 'JUST CROWNED';
        
        const reign = Date.now() - this.state.lastSeen.getTime();
        const days = Math.floor(reign / (1000 * 60 * 60 * 24));
        const hours = Math.floor((reign % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        return `${days}d ${hours}h`;
    }

    /**
     * 🏆 Get most loyal subject
     */
    getMostLoyalSubject() {
        if (this.state.subjects.size === 0) return 'None';
        
        let mostLoyal = { loyalty: 0 };
        for (const [id, subject] of this.state.subjects) {
            if (subject.loyalty > mostLoyal.loyalty) {
                mostLoyal = { id, ...subject };
            }
        }
        
        return mostLoyal.name || mostLoyal.id;
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
            decreeQueueLength: this.royalDecrees.length,
            historySize: this.messageHistory.length,
            royalProtocol: this.config.royalProtocol,
            subjectCount: this.state.subjects.size
        };
    }

    /**
     * 🛑 Disconnect bot - ROYAL DEPARTURE
     */
    disconnect() {
        console.log('🏰 [QUEEN RIXIE] Royal departure initiated...');
        
        if (this.ws) {
            this.ws.close(1000, 'ROYAL_DEPARTURE');
        }
        
        this.isConnected = false;
        this.isAuthenticated = false;
        this.updateStatus('offline');

        this.emit('royal_departure');
    }

    /**
     * 🔄 Restart bot - ROYAL RETURN
     */
    restart() {
        console.log('🔄 [QUEEN RIXIE] Royal return initiated...');
        this.disconnect();
        
        setTimeout(() => {
            this.init();
        }, 3000); // Royal procession takes time
    }
}

module.exports = QueenRixieBot;

// 🚀 Quick start function
function createQueenRixieBot(config) {
    return new QueenRixieBot(config);
}

// 📝 Example usage
if (require.main === module) {
    const bot = new QueenRixieBot({
        scannerUrl: 'ws://localhost:3000/savage-ws',
        sessionId: 'SAVAGE-XMD-BOT-SESSION-XXXXXXXXXXXX-XXXXXXXXXX-XXXXXXXXXXXX',
        botName: 'QUEEN RIXIE',
        royalProtocol: true,
        commandAuthority: 'supreme'
    });

    // Event handlers
    bot.on('royal_authenticated', (data) => {
        console.log('🎉 QUEEN RIXIE throne authenticated! LONG LIVE THE QUEEN!');
    });

    bot.on('royal_audience', (data) => {
        console.log('🏰 Royal audience granted to:', data.from);
    });

    bot.on('royal_error', (error) => {
        console.error('❌ Royal chamber error:', error);
    });
}
