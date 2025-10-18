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
            ownerPhoneNumber: null,
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
        this.initializeSocketIO();
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
     * 🌐 Initialize Socket.IO connection
     */
    initializeSocketIO() {
        try {
            this.socket = io({
                timeout: 10000,
                reconnectionAttempts: 5,
                reconnectionDelay: 3000
            });
            
            this.setupSocketEvents();
            
        } catch (error) {
            console.error('❌ Socket.IO connection failed:', error);
            this.showError('Failed to connect to scanner server');
        }
    }

    /**
     * 🔌 Setup Socket.IO event handlers - UPDATED
     */
    setupSocketEvents() {
        // Connection events
        this.socket.on('connect', () => this.handleSocketConnect());
        this.socket.on('disconnect', () => this.handleSocketDisconnect());
        this.socket.on('connect_error', (error) => this.handleSocketError(error));
        
        // Scanner events
        this.socket.on('scanner_status', (data) => this.handleScannerStatus(data));
        this.socket.on('qr_data', (data) => this.handleQRData(data));
        this.socket.on('ready', (data) => this.handleReady(data));
        this.socket.on('status_update', (data) => this.handleStatusUpdate(data));
        this.socket.on('bot_status', (data) => this.handleBotStatus(data));
        this.socket.on('connection_update', (data) => this.handleConnectionUpdate(data));
        this.socket.on('auth_result', (data) => this.handleAuthResult(data));
        this.socket.on('phone_number_updated', (data) => this.handlePhoneNumberUpdate(data));
        this.socket.on('pairing_generated', (data) => this.handlePairingGenerated(data));
        this.socket.on('logout', (data) => this.handleLogoutEvent(data));
        this.socket.on('logout_success', (data) => this.handleLogoutSuccess(data));
        
        // Error events
        this.socket.on('error', (data) => this.handleError(data));
    }

    /**
     * 🔌 Handle Socket.IO connection
     */
    handleSocketConnect() {
        console.log('✅ Socket.IO connected to SAVAGE SCANNER');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        this.updateStatus('connected', 'Connected to scanner server');
        this.showNotification('Connected to scanner server', 'success');
        
        // Request current status
        this.socket.emit('get_status');
    }

    /**
     * 🔌 Handle Socket.IO disconnect
     */
    handleSocketDisconnect() {
        console.log('🔌 Socket.IO connection disconnected');
        this.isConnected = false;
        this.updateStatus('disconnected', 'Disconnected from server');
        this.showNotification('Disconnected from server', 'warning');
    }

    /**
     * ❌ Handle Socket.IO error
     */
    handleSocketError(error) {
        console.error('❌ Socket.IO connection error:', error);
        this.updateStatus('error', 'Connection error');
        this.showNotification('Connection error: ' + error.message, 'error');
    }

    /**
     * 📨 Handle scanner status
     */
    handleScannerStatus(data) {
        console.log('📊 Scanner status:', data);
        
        if (data.whatsapp && data.sessionId) {
            this.sessionId = data.sessionId;
            this.updateSessionInfo(data);
        }
        
        // Update owner phone number if available
        if (data.ownerPhoneNumber) {
            this.scannerState.ownerPhoneNumber = data.ownerPhoneNumber;
            this.updateOwnerNumberDisplay(data.ownerPhoneNumber);
        }
        
        if (data.hasQr) {
            this.socket.emit('get_qr');
        }
    }

    /**
     * 📱 Handle QR code data - UPDATED WITH OWNER NUMBER
     */
    handleQRData(data) {
        console.log('📱 QR Data received:', data);
        
        this.scannerState.qrCode = data.qrImage;
        this.scannerState.pairingCode = data.pairingCode;
        
        // Update phone numbers if provided
        if (data.phoneNumber) {
            this.scannerState.phoneNumber = data.phoneNumber;
            this.updatePhoneNumberDisplay(data.phoneNumber);
        }
        
        if (data.ownerPhoneNumber) {
            this.scannerState.ownerPhoneNumber = data.ownerPhoneNumber;
            this.updateOwnerNumberDisplay(data.ownerPhoneNumber);
        }
        
        this.updateQRCode(data.qrImage, data.qrRaw);
        this.updatePairingCode(data.pairingCode);
        
        // Show appropriate status based on auto-generation
        if (data.autoGenerated) {
            this.updateStatus('qr_ready', 'QR code automatically generated - Ready for scanning');
        } else if (data.manualRequest) {
            this.updateStatus('pairing_ready', 'Pairing code generated for your number');
        } else {
            this.updateStatus('waiting_qr', 'Scan QR code or use pairing code');
        }
        
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
     * 🚀 Handle scanner ready state - UPDATED WITH SYNCING
     */
    handleReady(data) {
        this.sessionId = data.sessionId;
        this.scannerState.phoneNumber = data.phoneNumber;
        this.scannerState.ownerPhoneNumber = data.ownerPhoneNumber;
        this.scannerState.status = 'connected';
        
        this.updateStatus('connected', 'WhatsApp connected and synced!');
        this.updateSessionInfo(data);
        this.updatePhoneNumberDisplay(data.phoneNumber);
        this.updateOwnerNumberDisplay(data.ownerPhoneNumber);
        
        this.showNotification('✅ WhatsApp connected successfully! Session ID sent to owner.', 'success');
        
        // Update bot statuses
        this.updateBotStatus('SAVAGE-X', 'online');
        this.updateBotStatus('DE-UKNOWN-BOT', 'online');
        this.updateBotStatus('QUEEN-RIXIE', 'online');
        
        console.log('🚀 Scanner ready:', data.sessionId);
    }

    /**
     * 📊 Handle status updates - UPDATED WITH SYNCING
     */
    handleStatusUpdate(data) {
        this.updateStatus(data.status, data.message);
        
        if (data.phoneNumber) {
            this.scannerState.phoneNumber = data.phoneNumber;
            this.updatePhoneNumberDisplay(data.phoneNumber);
        }
        
        if (data.status === 'syncing') {
            this.showNotification('🔄 Syncing with WhatsApp...', 'warning');
        } else if (data.status === 'pairing_ready') {
            this.showNotification('🔢 Pairing code generated successfully!', 'success');
        }
    }

    /**
     * 📱 Handle phone number updates
     */
    handlePhoneNumberUpdate(data) {
        if (data.phoneNumber) {
            this.scannerState.phoneNumber = data.phoneNumber;
            this.updatePhoneNumberDisplay(data.phoneNumber);
            this.showNotification(`Phone number updated: ${data.phoneNumber}`, 'success');
        }
        
        if (data.ownerPhoneNumber) {
            this.scannerState.ownerPhoneNumber = data.ownerPhoneNumber;
            this.updateOwnerNumberDisplay(data.ownerPhoneNumber);
        }
        
        if (data.pairingCode) {
            this.updatePairingCode(data.pairingCode);
        }
    }

    /**
     * 🔄 Handle connection updates
     */
    handleConnectionUpdate(data) {
        if (data.status) {
            this.updateStatus(data.status, data.message || 'Connection update');
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
     * 🆕 Handle pairing code generation result
     */
    handlePairingGenerated(data) {
        if (data.success) {
            this.scannerState.pairingCode = data.pairingCode;
            this.updatePairingCode(data.pairingCode);
            this.showNotification(`✅ ${data.message}`, 'success');
            
            // Show manual pairing button
            const manualPairingBtn = document.getElementById('generateManualPairingBtn');
            if (manualPairingBtn) {
                manualPairingBtn.style.display = 'inline-block';
            }
        } else {
            this.showNotification(`❌ ${data.error}`, 'error');
        }
    }

    /**
     * 🆕 Handle logout event from server
     */
    handleLogoutEvent(data) {
        console.log('🚪 Logout event received:', data);
        this.showNotification(data.message || 'Logged out by server', 'warning');
        this.handleClientLogout();
    }

    /**
     * 🆕 Handle logout success confirmation
     */
    handleLogoutSuccess(data) {
        if (data.success) {
            this.showNotification('✅ Successfully logged out', 'success');
            this.handleClientLogout();
        } else {
            this.showNotification(`❌ ${data.error}`, 'error');
        }
    }

    /**
     * 🆕 Handle client-side logout cleanup
     */
    handleClientLogout() {
        // Clear local state
        this.isAuthenticated = false;
        this.sessionId = null;
        this.scannerState.phoneNumber = null;
        this.scannerState.ownerPhoneNumber = null;
        this.scannerState.qrCode = null;
        this.scannerState.pairingCode = null;
        
        // Clear localStorage
        localStorage.removeItem('savage_session_token');
        localStorage.removeItem('savage_session_ip');
        
        // Reset UI
        this.updateStatus('disconnected', 'Logged out');
        this.updatePhoneNumberDisplay(null);
        this.updateOwnerNumberDisplay(null);
        this.updatePairingCode(null);
        this.updateQRCode(null, null);
        
        // Reset bot statuses
        this.updateBotStatus('SAVAGE-X', 'offline');
        this.updateBotStatus('DE-UKNOWN-BOT', 'offline');
        this.updateBotStatus('QUEEN-RIXIE', 'offline');
        
        // Hide manual pairing button
        const manualPairingBtn = document.getElementById('generateManualPairingBtn');
        if (manualPairingBtn) {
            manualPairingBtn.style.display = 'none';
        }
        
        console.log('✅ Client logout completed');
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
     * 🎨 Update QR code display - IMPROVED WITH FALLBACK
     */
    updateQRCode(qrImage, qrRaw = null) {
        const qrElement = document.getElementById('qrCode');
        if (!qrElement) return;

        if (qrImage) {
            // Display QR image
            qrElement.innerHTML = `
                <img src="${qrImage}" alt="WhatsApp QR Code" style="max-width: 100%; height: auto; border: 2px solid var(--matrix-green); border-radius: 8px;">
            `;
        } else if (qrRaw) {
            // Fallback: display manual pairing instructions
            qrElement.innerHTML = `
                <div class="manual-qr-fallback">
                    <h4>📱 Manual Pairing Required</h4>
                    <p>Use this code in WhatsApp:</p>
                    <div class="manual-code">${qrRaw}</div>
                    <p><small>Go to WhatsApp → Linked Devices → Link a Device</small></p>
                </div>
            `;
        } else {
            qrElement.innerHTML = `
                <div class="loading-spinner"></div>
                <p class="loading-text">Waiting for phone number setup...</p>
            `;
        }
        
        // Update QR status
        const qrStatus = document.getElementById('qrStatus');
        if (qrStatus) {
            if (qrImage) {
                qrStatus.textContent = 'QR Code Ready - Scan with WhatsApp';
                qrStatus.className = 'status-syncing';
            } else if (qrRaw) {
                qrStatus.textContent = 'Manual Pairing Code Ready';
                qrStatus.className = 'status-waiting';
            } else {
                qrStatus.textContent = 'Setup phone number first';
                qrStatus.className = 'status-waiting';
            }
        }

        // Show download button if QR image is available
        const downloadBtn = document.getElementById('downloadQRBtn');
        if (downloadBtn) {
            downloadBtn.style.display = qrImage ? 'inline-block' : 'none';
            if (qrImage) {
                downloadBtn.onclick = () => this.downloadQRCode(qrImage);
            }
        }
    }

    /**
     * 📥 Download QR code
     */
    downloadQRCode(qrImage) {
        const link = document.createElement('a');
        link.href = qrImage;
        link.download = `savage-scanner-qr-${Date.now()}.png`;
        link.click();
        this.showNotification('QR code downloaded', 'success');
    }

    /**
     * 🔢 Update pairing code display
     */
    updatePairingCode(pairingCode) {
        const pairingElement = document.getElementById('pairingCode');
        if (pairingElement) {
            pairingElement.textContent = pairingCode || '------';
        }
        
        const pairingStatus = document.getElementById('pairingStatus');
        if (pairingStatus) {
            if (pairingCode) {
                pairingStatus.textContent = 'Pairing Code Ready';
                pairingStatus.className = 'status-syncing';
            } else {
                pairingStatus.textContent = 'Generate pairing code for your number';
                pairingStatus.className = 'status-waiting';
            }
        }

        // Update copy button
        const copyBtn = document.getElementById('copyPairingBtn');
        if (copyBtn) {
            copyBtn.onclick = () => this.copyPairingCode(pairingCode);
        }
    }

    /**
     * 📱 Update phone number display
     */
    updatePhoneNumberDisplay(phoneNumber) {
        const phoneDisplay = document.getElementById('phoneNumberDisplay');
        
        if (phoneDisplay) {
            phoneDisplay.textContent = phoneNumber || 'Not connected';
            phoneDisplay.className = phoneNumber ? 'session-value status-connected' : 'session-value status-disconnected';
        }
    }

    /**
     * 🆕 Update owner number display
     */
    updateOwnerNumberDisplay(ownerNumber) {
        const ownerDisplay = document.getElementById('ownerNumberDisplay');
        const phoneStatus = document.getElementById('phoneStatus');
        
        if (ownerDisplay) {
            ownerDisplay.textContent = ownerNumber || 'Not set';
            ownerDisplay.className = ownerNumber ? 'session-value status-connected' : 'session-value status-disconnected';
        }
        
        if (phoneStatus) {
            if (ownerNumber) {
                phoneStatus.textContent = `Owner number: ${ownerNumber}`;
                phoneStatus.className = 'status-connected';
                
                // Show generate pairing button
                const generatePairingBtn = document.getElementById('generatePairingBtn');
                if (generatePairingBtn) {
                    generatePairingBtn.style.display = 'inline-block';
                }
            } else {
                phoneStatus.textContent = 'Enter phone number to begin';
                phoneStatus.className = 'status-waiting';
            }
        }
    }

    /**
     * 📊 Update connection status
     */
    updateStatus(status, message) {
        this.scannerState.status = status;
        
        const statusElement = document.getElementById('connectionStatus');
        const messageElement = document.getElementById('statusMessage');
        const connectionState = document.getElementById('connectionState');
        
        if (statusElement) {
            statusElement.textContent = this.formatStatus(status);
            statusElement.className = `status-${status}`;
        }
        
        if (messageElement) {
            messageElement.textContent = message;
        }

        if (connectionState) {
            connectionState.textContent = this.formatStatus(status);
            connectionState.className = `session-value status-${status}`;
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
            'error': 'ERROR',
            'qr_ready': 'QR READY',
            'whatsapp_failed': 'WHATSAPP FAILED',
            'pairing_ready': 'PAIRING READY'
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
            'error': '💥',
            'qr_ready': '📱',
            'whatsapp_failed': '❌',
            'pairing_ready': '🔢'
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
            
            this.updateBotUI(botName, status, lastSeen);
        }
    }

    /**
     * 🎨 Update bot UI elements
     */
    updateBotUI(botName, status, lastSeen = null) {
        const botId = botName.toLowerCase().replace('-', '_');
        const botElement = document.getElementById(`bot-${botId}`);
        const statusElement = document.getElementById(`status-${botId}`);
        const lastSeenElement = document.getElementById(`lastSeen-${botId}`);
        
        if (botElement) {
            botElement.className = `bot-card ${botId} ${status}`;
        }
        
        if (statusElement) {
            statusElement.textContent = status.toUpperCase();
            statusElement.className = `bot-status status-${status}`;
        }

        if (lastSeenElement && lastSeen) {
            lastSeenElement.textContent = this.formatRelativeTime(lastSeen);
        }
    }

    /**
     * 🔑 Update session information display
     */
    updateSessionInfo(data) {
        const sessionElement = document.getElementById('sessionId');
        
        if (sessionElement && data.sessionId) {
            sessionElement.textContent = data.sessionId;
            this.sessionId = data.sessionId;
            
            // Update footer session
            const footerSession = document.getElementById('footerSession');
            if (footerSession) {
                const shortId = data.sessionId.length > 20 ? 
                    data.sessionId.substring(0, 20) + '...' : data.sessionId;
                footerSession.textContent = shortId;
            }
        }
    }

    /**
     * 🎭 Show password interface
     */
    showPasswordInterface() {
        // Redirect to password page
        window.location.href = '/password';
    }

    /**
     * 📱 Show scanner interface
     */
    showScannerInterface() {
        // We're already on the scanner page, just ensure everything is visible
        console.log('🦅 Scanner interface active');
        
        // Request initial data
        if (this.socket && this.isConnected) {
            this.socket.emit('get_status');
        }
    }

    /**
     * 💬 Show notification
     */
    showNotification(message, type = 'info') {
        // Use the global notification function if available
        if (window.showNotification) {
            window.showNotification(message, type);
            return;
        }

        // Fallback notification system
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${this.getNotificationIcon(type)}</span>
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        const container = document.getElementById('notifications');
        if (container) {
            container.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 5000);
        }
    }

    /**
     * 🎯 Get notification icon
     */
    getNotificationIcon(type) {
        const icons = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        return icons[type] || 'ℹ️';
    }

    /**
     * 🎛️ Setup event listeners - UPDATED
     */
    setupEventListeners() {
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

        // Copy pairing code button
        const copyPairingBtn = document.getElementById('copyPairingBtn');
        if (copyPairingBtn) {
            copyPairingBtn.addEventListener('click', () => {
                const pairingCode = document.getElementById('pairingCode').textContent;
                if (pairingCode && pairingCode !== '------') {
                    this.copyPairingCode(pairingCode);
                }
            });
        }

        // Generate manual pairing button
        const generateManualPairingBtn = document.getElementById('generateManualPairingBtn');
        if (generateManualPairingBtn) {
            generateManualPairingBtn.addEventListener('click', () => this.generateManualPairingCode());
        }

        // Phone number handling
        this.setupPhoneNumberHandling();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    /**
     * 📱 Setup phone number handling
     */
    setupPhoneNumberHandling() {
        const savePhoneBtn = document.getElementById('savePhoneBtn');
        const phoneInput = document.getElementById('phoneNumber');

        if (savePhoneBtn && phoneInput) {
            savePhoneBtn.addEventListener('click', () => this.savePhoneNumber());
            
            phoneInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.savePhoneNumber();
                }
            });
        }
    }

    /**
     * 💾 Save phone number
     */
    savePhoneNumber() {
        const phoneInput = document.getElementById('phoneNumber');
        const phoneNumber = phoneInput.value.trim();
        
        if (!phoneNumber) {
            this.showNotification('Please enter a phone number', 'error');
            return;
        }

        // Basic phone number validation
        if (!phoneNumber.startsWith('+')) {
            this.showNotification('Phone number must start with country code (e.g., +1234567890)', 'warning');
            return;
        }

        if (phoneNumber.length < 10) {
            this.showNotification('Please enter a valid phone number', 'warning');
            return;
        }

        // Send phone number to server
        if (this.socket && this.isConnected) {
            this.socket.emit('set_phone_number', { phoneNumber: phoneNumber });
            this.showNotification(`Owner number saved: ${phoneNumber}`, 'success');
            
            // Update local state
            this.scannerState.ownerPhoneNumber = phoneNumber;
            this.updateOwnerNumberDisplay(phoneNumber);
        } else {
            this.showNotification('Scanner not connected. Please wait...', 'error');
        }
    }

    /**
     * 🔢 Generate manual pairing code
     */
    generateManualPairingCode() {
        const phoneInput = document.getElementById('phoneNumber');
        const phoneNumber = phoneInput.value.trim();
        
        if (!phoneNumber) {
            this.showNotification('Please enter a phone number first', 'error');
            return;
        }

        if (this.socket && this.isConnected) {
            this.socket.emit('generate_pairing_code', { phoneNumber: phoneNumber });
            this.showNotification('Generating pairing code...', 'info');
        } else {
            this.showNotification('Scanner not connected', 'error');
        }
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
        this.socket.emit('authenticate', { password });
        
        // Reset button after delay
        setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            passwordInput.value = '';
        }, 2000);
    }

    /**
     * 🚪 Handle logout - UPDATED
     */
    handleLogout() {
        if (this.socket && this.isConnected) {
            this.socket.emit('logout_request');
            this.showNotification('Logging out...', 'info');
        } else {
            this.handleClientLogout();
        }
    }

    /**
     * 🔄 Refresh QR code
     */
    refreshQR() {
        if (this.socket) {
            this.socket.emit('refresh_qr');
            this.showNotification('Generating new QR code...', 'warning');
        }
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
     * 📋 Copy pairing code to clipboard
     */
    async copyPairingCode(pairingCode) {
        if (!pairingCode || pairingCode === '------') {
            this.showNotification('No pairing code available', 'error');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(pairingCode);
            this.showNotification('Pairing code copied to clipboard!', 'success');
        } catch (error) {
            console.error('❌ Failed to copy pairing code:', error);
            this.showNotification('Failed to copy pairing code', 'error');
        }
    }

    /**
     * ⌨️ Handle keyboard shortcuts - UPDATED
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

        // Ctrl+Shift+P - Focus phone input
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            const phoneInput = document.getElementById('phoneNumber');
            if (phoneInput) {
                phoneInput.focus();
            }
        }

        // Ctrl+Shift+G - Generate pairing code
        if (e.ctrlKey && e.shiftKey && e.key === 'G') {
            e.preventDefault();
            this.generateManualPairingCode();
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
                const botId = botName.toLowerCase().replace('-', '_');
                const lastSeenElement = document.getElementById(`lastSeen-${botId}`);
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

        // Update messages processed (mock data for now)
        const messagesElement = document.getElementById('messagesProcessed');
        if (messagesElement) {
            const current = parseInt(messagesElement.textContent) || 0;
            messagesElement.textContent = current + Math.floor(Math.random() * 3);
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
            phoneNumber: this.scannerState.phoneNumber,
            ownerPhoneNumber: this.scannerState.ownerPhoneNumber,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * 🧹 Cleanup and destroy
     */
    destroy() {
        if (this.socket) {
            this.socket.disconnect();
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
