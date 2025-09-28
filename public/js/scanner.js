/**
 * 🦅 SAVAGE BOTS SCANNER - Frontend Scanner Logic
 * Real-time WhatsApp QR code, pairing codes, and bot status management
 * Hacker-themed interface with WebSocket connections
 */

class SavageScanner {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.isConnected = false;
        this.isAuthenticated = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        
        // Scanner state
        this.scannerState = {
            qrCode: null,
            pairingCode: null,
            status: 'disconnected',
            phoneNumber: null,
            bots: {
                'SAVAGE-X': { status: 'offline', lastSeen: null },
                'DE-UKNOWN-BOT': { status: 'offline', lastSeen: null },
                'QUEEN-RIXIE': { status: 'offline', lastSeen: null }
            }
        };

        this.init();
    }

    /**
     * 🎯 Initialize scanner
     */
    init() {
        console.log('🦅 Initializing SAVAGE BOTS SCANNER...');
        
        this.checkAuthentication();
        this.initializeSocket();
        this.setupEventListeners();
        this.setupUIUpdates();
        
        // Initialize matrix effects if available
        if (window.savageMatrix) {
            window.savageMatrix.setColorScheme('matrix');
            window.savageMatrix.setIntensity(0.8);
        }
    }

    /**
     * 🔐 Check authentication status
     */
    checkAuthentication() {
        const sessionToken = localStorage.getItem('savage_session_token');
        const sessionIP = localStorage.getItem('savage_session_ip');
        
        if (sessionToken && sessionIP) {
            this.isAuthenticated = true;
            this.showScannerInterface();
        } else {
            this.showPasswordInterface();
        }
    }

    /**
     * 🌐 Initialize WebSocket connection
     */
    initializeSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/savage-ws`;
        
        try {
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => this.handleSocketOpen();
            this.socket.onmessage = (event) => this.handleSocketMessage(event);
            this.socket.onclose = () => this.handleSocketClose();
            this.socket.onerror = (error) => this.handleSocketError(error);
            
        } catch (error) {
            console.error('❌ WebSocket connection failed:', error);
            this.showError('Failed to connect to scanner server');
        }
    }

    /**
     * 🔌 Handle WebSocket connection open
     */
    handleSocketOpen() {
        console.log('✅ WebSocket connected to SAVAGE SCANNER');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        this.updateStatus('connected', 'Connected to scanner server');
        
        // Send authentication if we have a session token
        const sessionToken = localStorage.getItem('savage_session_token');
        if (sessionToken) {
            this.sendAuthRequest(sessionToken);
        }
    }

    /**
     * 📨 Handle WebSocket messages
     */
    handleSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('📨 Received:', data.type, data);
            
            switch (data.type) {
                case 'qr_data':
                    this.handleQRData(data);
                    break;
                case 'auth_result':
                    this.handleAuthResult(data);
                    break;
                case 'ready':
                    this.handleReady(data);
                    break;
                case 'status_update':
                    this.handleStatusUpdate(data);
                    break;
                case 'bot_status':
                    this.handleBotStatus(data);
                    break;
                case 'session_info':
                    this.handleSessionInfo(data);
                    break;
                case 'error':
                    this.handleError(data);
                    break;
                default:
                    console.warn('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('❌ Failed to parse WebSocket message:', error);
        }
    }

    /**
     * 🔌 Handle WebSocket connection close
     */
    handleSocketClose() {
        console.log('🔌 WebSocket connection closed');
        this.isConnected = false;
        this.updateStatus('disconnected', 'Disconnected from server');
        
        this.attemptReconnect();
    }

    /**
     * ❌ Handle WebSocket error
     */
    handleSocketError(error) {
        console.error('❌ WebSocket error:', error);
        this.updateStatus('error', 'Connection error');
    }

    /**
     * 🔄 Attempt to reconnect WebSocket
     */
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            
            console.log(`🔄 Reconnecting in ${delay/1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            this.updateStatus('reconnecting', `Reconnecting... Attempt ${this.reconnectAttempts}`);
            
            setTimeout(() => {
                this.initializeSocket();
            }, delay);
        } else {
            console.error('💥 Maximum reconnection attempts reached');
            this.updateStatus('error', 'Failed to reconnect to server');
        }
    }

    /**
     * 📨 Send message via WebSocket
     */
    sendMessage(type, data = {}) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const message = { type, ...data };
            this.socket.send(JSON.stringify(message));
            console.log('📤 Sent:', type, message);
        } else {
            console.warn('⚠️ WebSocket not ready, message not sent:', type);
        }
    }

    /**
     * 🔐 Send authentication request
     */
    sendAuthRequest(sessionToken) {
        this.sendMessage('auth_request', {
            sessionToken,
            userAgent: navigator.userAgent,
            timestamp: Date.now()
        });
    }

    /**
     * 📱 Handle QR code data
     */
    handleQRData(data) {
        this.scannerState.qrCode = data.qrImage;
        this.scannerState.pairingCode = data.pairingCode;
        
        this.updateQRCode(data.qrImage);
        this.updatePairingCode(data.pairingCode);
        this.updateStatus('waiting_qr', 'Scan QR code or use pairing code');
        
        console.log('📱 QR Code received:', data.pairingCode);
    }

    /**
     * ✅ Handle authentication result
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

    /**
     * 🚀 Handle scanner ready state
     */
    handleReady(data) {
        this.sessionId = data.sessionId;
        this.scannerState.phoneNumber = data.phoneNumber;
        this.scannerState.status = 'connected';
        
        this.updateStatus('connected', 'WhatsApp connected and ready');
        this.updateSessionInfo(data);
        this.showNotification('WhatsApp connected successfully!', 'success');
        
        // Update bot statuses
        this.updateBotStatus('SAVAGE-X', 'online');
        this.updateBotStatus('DE-UKNOWN-BOT', 'online');
        this.updateBotStatus('QUEEN-RIXIE', 'online');
        
        console.log('🚀 Scanner ready:', data.sessionId);
    }

    /**
     * 📊 Handle status updates
     */
    handleStatusUpdate(data) {
        this.updateStatus(data.status, data.message);
        
        if (data.status === 'syncing') {
            this.showNotification('Syncing with WhatsApp...', 'warning');
        }
    }

    /**
     * 🤖 Handle bot status updates
     */
    handleBotStatus(data) {
        if (data.botName && data.status) {
            this.updateBotStatus(data.botName, data.status, data.lastSeen);
        }
    }

    /**
     * 🔑 Handle session information
     */
    handleSessionInfo(data) {
        this.sessionId = data.sessionId;
        this.updateSessionInfo(data);
    }

    /**
     * ❌ Handle error messages
     */
    handleError(data) {
        console.error('❌ Server error:', data.message);
        this.showNotification(data.message || 'An error occurred', 'error');
        
        if (data.fatal) {
            this.updateStatus('error', 'Fatal error - please refresh');
        }
    }

    /**
     * 🎨 Update QR code display
     */
    updateQRCode(qrImage) {
        const qrElement = document.getElementById('qrCode');
        if (qrElement) {
            qrElement.innerHTML = `<img src="${qrImage}" alt="WhatsApp QR Code" style="width: 100%; height: auto;">`;
        }
        
        // Update QR status
        const qrStatus = document.getElementById('qrStatus');
        if (qrStatus) {
            qrStatus.textContent = 'QR Code Ready - Scan with WhatsApp';
            qrStatus.className = 'status-syncing';
        }
    }

    /**
     * 🔢 Update pairing code display
     */
    updatePairingCode(pairingCode) {
        const pairingElement = document.getElementById('pairingCode');
        if (pairingElement) {
            pairingElement.textContent = pairingCode;
        }
        
        const pairingStatus = document.getElementById('pairingStatus');
        if (pairingStatus) {
            pairingStatus.textContent = 'Pairing Code Ready';
            pairingStatus.className = 'status-syncing';
        }
    }

    /**
     * 📊 Update connection status
     */
    updateStatus(status, message) {
        this.scannerState.status = status;
        
        const statusElement = document.getElementById('connectionStatus');
        const messageElement = document.getElementById('statusMessage');
        
        if (statusElement) {
            statusElement.textContent = this.formatStatus(status);
            statusElement.className = `status-${status}`;
        }
        
        if (messageElement) {
            messageElement.textContent = message;
        }
        
        // Update status icon
        this.updateStatusIcon(status);
    }

    /**
     * 🎨 Format status for display
     */
    formatStatus(status) {
        const statusMap = {
            'connected': 'CONNECTED',
            'disconnected': 'DISCONNECTED',
            'waiting_qr': 'WAITING FOR SCAN',
            'syncing': 'SYNCING...',
            'reconnecting': 'RECONNECTING...',
            'error': 'ERROR'
        };
        
        return statusMap[status] || status.toUpperCase();
    }

    /**
     * 🎯 Update status icon
     */
    updateStatusIcon(status) {
        const iconElement = document.getElementById('statusIcon');
        if (!iconElement) return;
        
        const icons = {
            'connected': '🟢',
            'disconnected': '🔴',
            'waiting_qr': '🟡',
            'syncing': '🟠',
            'reconnecting': '🟣',
            'error': '💥'
        };
        
        iconElement.textContent = icons[status] || '⚪';
    }

    /**
     * 🤖 Update bot status
     */
    updateBotStatus(botName, status, lastSeen = null) {
        if (this.scannerState.bots[botName]) {
            this.scannerState.bots[botName].status = status;
            this.scannerState.bots[botName].lastSeen = lastSeen || new Date();
            
            this.updateBotUI(botName, status);
        }
    }

    /**
     * 🎨 Update bot UI elements
     */
    updateBotUI(botName, status) {
        const botElement = document.getElementById(`bot-${botName.toLowerCase()}`);
        const statusElement = document.getElementById(`status-${botName.toLowerCase()}`);
        
        if (botElement) {
            botElement.className = `bot-card ${botName.toLowerCase().replace('-', '')} ${status}`;
        }
        
        if (statusElement) {
            statusElement.textContent = status.toUpperCase();
            statusElement.className = `bot-status status-${status}`;
        }
    }

    /**
     * 🔑 Update session information display
     */
    updateSessionInfo(data) {
        const sessionElement = document.getElementById('sessionId');
        const phoneElement = document.getElementById('phoneNumber');
        
        if (sessionElement && data.sessionId) {
            sessionElement.textContent = data.sessionId;
        }
        
        if (phoneElement && data.phoneNumber) {
            phoneElement.textContent = data.phoneNumber;
        }
    }

    /**
     * 🎭 Show password interface
     */
    showPasswordInterface() {
        this.hideAllInterfaces();
        
        const passwordInterface = document.getElementById('passwordInterface');
        if (passwordInterface) {
            passwordInterface.style.display = 'block';
        }
    }

    /**
     * 📱 Show scanner interface
     */
    showScannerInterface() {
        this.hideAllInterfaces();
        
        const scannerInterface = document.getElementById('scannerInterface');
        if (scannerInterface) {
            scannerInterface.style.display = 'block';
        }
        
        // Request QR code if not already received
        if (!this.scannerState.qrCode) {
            this.sendMessage('get_qr');
        }
    }

    /**
     * 🚫 Hide all interfaces
     */
    hideAllInterfaces() {
        const interfaces = ['passwordInterface', 'scannerInterface'];
        interfaces.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'none';
            }
        });
    }

    /**
     * 💬 Show notification
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type}`;
        notification.innerHTML = `
            <strong>${type.toUpperCase()}:</strong> ${message}
            <button class="close-btn" onclick="this.parentElement.remove()">×</button>
        `;
        
        // Add to notifications container
        const container = document.getElementById('notifications');
        if (container) {
            container.appendChild(notification);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        }
    }

    /**
     * 🎛️ Setup event listeners
     */
    setupEventListeners() {
        // Password form submission
        const passwordForm = document.getElementById('passwordForm');
        if (passwordForm) {
            passwordForm.addEventListener('submit', (e) => this.handlePasswordSubmit(e));
        }
        
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }
        
        // Refresh QR button
        const refreshQRBtn = document.getElementById('refreshQRBtn');
        if (refreshQRBtn) {
            refreshQRBtn.addEventListener('click', () => this.refreshQR());
        }
        
        // Copy session ID button
        const copySessionBtn = document.getElementById('copySessionBtn');
        if (copySessionBtn) {
            copySessionBtn.addEventListener('click', () => this.copySessionId());
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    /**
     * 🔑 Handle password form submission
     */
    handlePasswordSubmit(e) {
        e.preventDefault();
        
        const passwordInput = document.getElementById('passwordInput');
        const password = passwordInput.value.trim();
        
        if (!password) {
            this.showNotification('Please enter a password', 'error');
            return;
        }
        
        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'AUTHENTICATING...';
        submitBtn.disabled = true;
        
        // Send authentication request
        this.sendMessage('authenticate', { password });
        
        // Reset button after delay
        setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            passwordInput.value = '';
        }, 2000);
    }

    /**
     * 🚪 Handle logout
     */
    handleLogout() {
        localStorage.removeItem('savage_session_token');
        localStorage.removeItem('savage_session_ip');
        
        this.isAuthenticated = false;
        this.showPasswordInterface();
        this.showNotification('Logged out successfully', 'success');
        
        // Notify server
        this.sendMessage('logout');
    }

    /**
     * 🔄 Refresh QR code
     */
    refreshQR() {
        this.sendMessage('refresh_qr');
        this.showNotification('Generating new QR code...', 'warning');
    }

    /**
     * 📋 Copy session ID to clipboard
     */
    async copySessionId() {
        if (!this.sessionId) {
            this.showNotification('No session ID available', 'error');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(this.sessionId);
            this.showNotification('Session ID copied to clipboard!', 'success');
        } catch (error) {
            console.error('❌ Failed to copy session ID:', error);
            this.showNotification('Failed to copy session ID', 'error');
        }
    }

    /**
     * ⌨️ Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(e) {
        // Ctrl+Shift+L - Logout
        if (e.ctrlKey && e.shiftKey && e.key === 'L') {
            e.preventDefault();
            this.handleLogout();
        }
        
        // Ctrl+Shift+R - Refresh QR
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            this.refreshQR();
        }
        
        // Ctrl+Shift+C - Copy session ID
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            this.copySessionId();
        }
    }

    /**
     * 🔄 Setup periodic UI updates
     */
    setupUIUpdates() {
        // Update timers every second
        setInterval(() => {
            this.updateTimers();
        }, 1000);
        
        // Update stats every 5 seconds
        setInterval(() => {
            this.updateStats();
        }, 5000);
    }

    /**
     * ⏰ Update timers and relative times
     */
    updateTimers() {
        // Update bot last seen times
        Object.keys(this.scannerState.bots).forEach(botName => {
            const bot = this.scannerState.bots[botName];
            if (bot.lastSeen) {
                const lastSeenElement = document.getElementById(`lastSeen-${botName.toLowerCase()}`);
                if (lastSeenElement) {
                    lastSeenElement.textContent = this.formatRelativeTime(bot.lastSeen);
                }
            }
        });
    }

    /**
     * 📊 Update statistics
     */
    updateStats() {
        const onlineBots = Object.values(this.scannerState.bots).filter(bot => 
            bot.status === 'online'
        ).length;
        
        const statsElement = document.getElementById('onlineBotsCount');
        if (statsElement) {
            statsElement.textContent = onlineBots;
        }
    }

    /**
     * ⏱️ Format relative time
     */
    formatRelativeTime(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffSec = Math.floor(diffMs / 1000);
        
        if (diffSec < 60) return 'just now';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        return `${Math.floor(diffSec / 86400)}d ago`;
    }

    /**
     * 🏥 Get scanner health status
     */
    getHealthStatus() {
        return {
            websocket: this.isConnected ? 'connected' : 'disconnected',
            authenticated: this.isAuthenticated,
            scanner: this.scannerState.status,
            bots: this.scannerState.bots,
            sessionId: this.sessionId,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * 🧹 Cleanup and destroy
     */
    destroy() {
        if (this.socket) {
            this.socket.close();
        }
        
        localStorage.removeItem('savage_session_token');
        localStorage.removeItem('savage_session_ip');
        
        console.log('🧹 SavageScanner destroyed');
    }
}

// Initialize scanner when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.savageScanner = new SavageScanner();
    
    // Global function for password submission (for form action)
    window.submitPassword = function() {
        if (window.savageScanner) {
            const event = new Event('submit');
            document.getElementById('passwordForm').dispatchEvent(event);
        }
    };
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SavageScanner;
}
