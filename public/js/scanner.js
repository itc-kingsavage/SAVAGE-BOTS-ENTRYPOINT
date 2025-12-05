/**
 * 🦅 SAVAGE BOTS SCANNER - Frontend Scanner Logic
 * Real-time WhatsApp QR code, pairing codes, and bot status management
 * Hacker-themed interface with WebSocket connections
 * UPDATED: Manual-only Pairing Codes + QR Auto-regeneration + BOT SELECTION
 */

class SavageScanner {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.selectedBot = null; // NEW: Track selected bot
        this.isConnected = false;
        this.isAuthenticated = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        
        // Scanner state - UPDATED with manual-only pairing codes
        this.scannerState = {
            qrCode: null,
            pairingCode: null,
            status: 'disconnected',
            phoneNumber: null,
            connectionType: 'automatic',
            pairingPhoneNumber: '',
            pairingCodeActive: false,
            bots: {
                'SAVAGE-X': { status: 'offline', lastSeen: null, selected: false },
                'DE-UKNOWN-BOT': { status: 'offline', lastSeen: null, selected: false },
                'QUEEN-RIXIE': { status: 'offline', lastSeen: null, selected: false }
            }
        };

        this.qrRegeneration = {
            lastGenerated: null,
            timeoutId: null,
            regenerationTime: 30000,
            isRegenerating: false
        };

        this.init();
    }

    /**
     * 🎯 Initialize scanner - UPDATED with bot selection
     */
    init() {
        console.log('🦅 Initializing SAVAGE BOTS SCANNER - Manual-only Pairing Mode...');
        
        this.checkAuthentication();
        this.initializeSocketIO();
        this.setupEventListeners();
        this.setupUIUpdates();
        this.setupBotSelection(); // NEW: Setup bot selection
        
        if (window.savageMatrix) {
            window.savageMatrix.setColorScheme('matrix');
            window.savageMatrix.setIntensity(0.8);
        }

        setTimeout(() => {
            this.showNotification('🦅 SAVAGE SCANNER READY - Tap a bot to connect', 'success');
        }, 1000);
    }

    // ... [KEEP ALL EXISTING METHODS UNTIL setupEventListeners] ...

    /**
     * 🎛️ Setup event listeners - UPDATED with bot selection
     */
    setupEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.handleLogout());
        
        // Refresh QR button
        const refreshQRBtn = document.getElementById('refreshQRBtn');
        if (refreshQRBtn) refreshQRBtn.addEventListener('click', () => this.refreshQR());
        
        // Copy session ID button
        const copySessionBtn = document.getElementById('copySessionBtn');
        if (copySessionBtn) copySessionBtn.addEventListener('click', () => this.copySessionId());

        // Copy pairing code button
        const copyPairingBtn = document.getElementById('copyPairingBtn');
        if (copyPairingBtn) {
            copyPairingBtn.disabled = true;
            copyPairingBtn.addEventListener('click', () => {
                const pairingCode = document.getElementById('pairingCode').textContent;
                if (pairingCode && pairingCode !== '--------') {
                    this.copyPairingCode(pairingCode);
                }
            });
        }

        // Generate pairing code button
        const generatePairingBtn = document.getElementById('generatePairingBtn');
        if (generatePairingBtn) {
            generatePairingBtn.disabled = true;
            generatePairingBtn.addEventListener('click', () => this.generatePairingCode());
        }

        // Phone input validation
        const phoneInput = document.getElementById('pairingPhoneInput');
        if (phoneInput) {
            phoneInput.addEventListener('input', () => {
                const phoneNumber = phoneInput.value.trim();
                const isValid = this.isValidPhoneNumber(phoneNumber);
                
                if (generatePairingBtn) {
                    generatePairingBtn.disabled = !isValid;
                }
                
                if (phoneNumber && !isValid) {
                    phoneInput.style.borderColor = 'var(--warning-red)';
                    this.showNotification('❌ Invalid phone number format', 'error');
                } else if (isValid) {
                    phoneInput.style.borderColor = 'var(--matrix-green)';
                } else {
                    phoneInput.style.borderColor = 'var(--accent-blue)';
                }
            });

            phoneInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.generatePairingCode();
                }
            });
        }

        // Download QR button
        const downloadQRBtn = document.getElementById('downloadQRBtn');
        if (downloadQRBtn) {
            downloadQRBtn.addEventListener('click', () => {
                if (this.scannerState.qrCode) {
                    this.downloadQRCode(this.scannerState.qrCode);
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    /**
     * 🤖 NEW: Setup bot selection
     */
    setupBotSelection() {
        const bots = ['SAVAGE-X', 'DE-UKNOWN-BOT', 'QUEEN-RIXIE'];
        
        bots.forEach(botName => {
            const botId = botName.toLowerCase().replace('-', '_');
            const card = document.getElementById(`bot-${botId}`);
            
            if (card) {
                // Make card clickable
                card.style.cursor = 'pointer';
                card.addEventListener('click', () => this.selectBot(botName));
                
                // Add selection indicator
                const selectedIndicator = document.createElement('div');
                selectedIndicator.className = 'selected-indicator';
                selectedIndicator.innerHTML = '✓';
                selectedIndicator.style.display = 'none';
                card.appendChild(selectedIndicator);
            }
        });
    }

    /**
     * 🤖 NEW: Select bot for connection
     */
    selectBot(botName) {
        // Don't reselect same bot
        if (this.selectedBot === botName) {
            this.showNotification(`✅ ${botName} already selected`, 'info');
            return;
        }
        
        console.log(`🤖 Selected bot: ${botName}`);
        
        // Update selected bot
        this.selectedBot = botName;
        
        // Visual feedback
        this.highlightSelectedBot(botName);
        
        // Emit to scanner backend
        if (this.socket && this.isConnected) {
            this.socket.emit('select_bot', {
                botName: botName,
                timestamp: Date.now()
            });
        }
        
        this.showNotification(`🔗 Preparing ${botName} session...`, 'info');
        this.updateStatus('waiting_bot', `Selected ${botName} - Generating session...`);
    }

    /**
     * 🤖 NEW: Highlight selected bot
     */
    highlightSelectedBot(selectedBot) {
        const bots = ['SAVAGE-X', 'DE-UKNOWN-BOT', 'QUEEN-RIXIE'];
        
        bots.forEach(botName => {
            const botId = botName.toLowerCase().replace('-', '_');
            const card = document.getElementById(`bot-${botId}`);
            const indicator = card ? card.querySelector('.selected-indicator') : null;
            
            if (card) {
                if (botName === selectedBot) {
                    card.classList.add('selected');
                    card.style.border = '2px solid var(--matrix-green)';
                    card.style.boxShadow = '0 0 20px var(--matrix-green)';
                    if (indicator) indicator.style.display = 'block';
                } else {
                    card.classList.remove('selected');
                    card.style.border = '';
                    card.style.boxShadow = '';
                    if (indicator) indicator.style.display = 'none';
                }
            }
        });
    }

    /**
     * 🤖 NEW: Handle bot selection response from server
     */
    handleBotSelected(data) {
        if (data.success && data.botName === this.selectedBot) {
            this.showNotification(`✅ ${data.botName} session created successfully`, 'success');
            
            // Update bot status in UI
            this.updateBotStatus(data.botName, 'selected', new Date());
            
            // Update connection status
            this.updateStatus('waiting_qr', `Generating QR for ${data.botName}...`);
        } else {
            this.showNotification(`❌ Failed to select ${data.botName || 'bot'}`, 'error');
        }
    }

    // ... [KEEP ALL EXISTING METHODS AFTER THIS] ...

    /**
     * 🔑 Handle authentication result
     */
    handleAuthResult(data) {
        if (data.success) {
            this.isAuthenticated = true;
            localStorage.setItem('savage_session_token', data.sessionToken);
            localStorage.setItem('savage_session_ip', data.clientIP);
            
            this.showScannerInterface();
            this.showNotification('Authentication successful', 'success');
        } else {
            this.isAuthenticated = false;
            localStorage.removeItem('savage_session_token');
            localStorage.removeItem('savage_session_ip');
            
            this.showPasswordInterface();
            this.showNotification(data.error || 'Authentication failed', 'error');
        }
    }

    // ... [KEEP ALL EXISTING SOCKET HANDLERS] ...

    /**
     * 🤖 Handle bot status updates
     */
    handleBotStatus(data) {
        if (data.botName && data.status) {
            this.updateBotStatus(data.botName, data.status, data.lastSeen);
            
            // If this is the selected bot and it's online, highlight it
            if (data.botName === this.selectedBot && data.status === 'online') {
                this.highlightSelectedBot(data.botName);
            }
        }
    }

    /**
     * 🎨 Update bot UI elements - UPDATED with selection state
     */
    updateBotUI(botName, status, lastSeen = null) {
        const botId = botName.toLowerCase().replace('-', '_');
        const botElement = document.getElementById(`bot-${botId}`);
        const statusElement = document.getElementById(`status-${botId}`);
        const lastSeenElement = document.getElementById(`lastSeen-${botId}`);
        
        if (botElement) {
            // Update classes
            botElement.className = `bot-card ${botId} ${status}`;
            
            // Add selected class if this is the selected bot
            if (botName === this.selectedBot) {
                botElement.classList.add('selected');
                botElement.style.border = '2px solid var(--matrix-green)';
                botElement.style.boxShadow = '0 0 20px var(--matrix-green)';
            }
        }
        
        if (statusElement) {
            statusElement.textContent = status.toUpperCase();
            statusElement.className = `bot-status status-${status}`;
        }

        if (lastSeenElement && lastSeen) {
            lastSeenElement.textContent = this.formatRelativeTime(lastSeen);
        }
    }

    // ... [KEEP ALL OTHER EXISTING METHODS] ...

    /**
     * 🏥 Get scanner health status - UPDATED with bot selection
     */
    getHealthStatus() {
        return {
            websocket: this.isConnected ? 'connected' : 'disconnected',
            authenticated: this.isAuthenticated,
            selectedBot: this.selectedBot, // NEW: Track selected bot
            scanner: this.scannerState.status,
            connectionType: this.scannerState.connectionType,
            bots: this.scannerState.bots,
            sessionId: this.sessionId,
            phoneNumber: this.scannerState.phoneNumber,
            pairingPhoneNumber: this.scannerState.pairingPhoneNumber,
            pairingCodeActive: this.scannerState.pairingCodeActive,
            hasQR: !!this.scannerState.qrCode,
            hasPairingCode: !!this.scannerState.pairingCode,
            reconnectAttempts: this.reconnectAttempts,
            qrRegeneration: {
                active: !!this.qrRegeneration.timeoutId,
                lastGenerated: this.qrRegeneration.lastGenerated
            }
        };
    }

    /**
     * 🧹 Cleanup and destroy
     */
    destroy() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        if (this.qrRegeneration.timeoutId) {
            clearTimeout(this.qrRegeneration.timeoutId);
        }
        
        localStorage.removeItem('savage_session_token');
        localStorage.removeItem('savage_session_ip');
        
        console.log('🧹 SavageScanner destroyed');
    }
}

// Initialize scanner when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.savageScanner = new SavageScanner();
    
    // Make scanner available globally
    window.getScannerStatus = () => {
        return window.savageScanner ? window.savageScanner.getHealthStatus() : null;
    };
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SavageScanner;
}
