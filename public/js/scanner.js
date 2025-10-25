/**
 * 🦅 SAVAGE BOTS SCANNER - Frontend Scanner Logic
 * Real-time WhatsApp QR code, pairing codes, and bot status management
 * Hacker-themed interface with WebSocket connections
 * UPDATED: Manual-only Pairing Codes + QR Auto-regeneration
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
        
        // Scanner state - UPDATED with manual-only pairing codes
        this.scannerState = {
            qrCode: null,
            pairingCode: null,
            status: 'disconnected',
            phoneNumber: null,
            connectionType: 'automatic',
            pairingPhoneNumber: '', // For manual pairing
            pairingCodeActive: false, // NEW: Track if pairing code is active
            bots: {
                'SAVAGE-X': { status: 'offline', lastSeen: null },
                'DE-UKNOWN-BOT': { status: 'offline', lastSeen: null },
                'QUEEN-RIXIE': { status: 'offline', lastSeen: null }
            }
        };

        // QR regeneration tracking
        this.qrRegeneration = {
            lastGenerated: null,
            timeoutId: null,
            regenerationTime: 30000, // 30 seconds
            isRegenerating: false
        };

        this.init();
    }

    /**
     * 🎯 Initialize scanner - UPDATED for manual-only pairing codes
     */
    init() {
        console.log('🦅 Initializing SAVAGE BOTS SCANNER - Manual-only Pairing Mode...');
        
        this.checkAuthentication();
        this.initializeSocketIO();
        this.setupEventListeners();
        this.setupUIUpdates();
        
        // Initialize matrix effects if available
        if (window.savageMatrix) {
            window.savageMatrix.setColorScheme('matrix');
            window.savageMatrix.setIntensity(0.8);
        }

        // Show manual-only mode notification
        setTimeout(() => {
            this.showNotification('🦅 SAVAGE SCANNER READY - Manual-only pairing codes active', 'success');
        }, 1000);
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
                reconnectionDelay: 3000,
                transports: ['websocket', 'polling']
            });
            
            this.setupSocketEvents();
            
        } catch (error) {
            console.error('❌ Socket.IO connection failed:', error);
            this.showError('Failed to connect to scanner server');
        }
    }

    /**
     * 🔌 Setup Socket.IO event handlers - UPDATED for manual-only pairing
     */
    setupSocketEvents() {
        // Connection events
        this.socket.on('connect', () => this.handleSocketConnect());
        this.socket.on('disconnect', () => this.handleSocketDisconnect());
        this.socket.on('connect_error', (error) => this.handleSocketError(error));
        
        // Scanner events - UPDATED with manual pairing code events
        this.socket.on('scanner_status', (data) => this.handleScannerStatus(data));
        this.socket.on('qr_data', (data) => this.handleQRData(data));
        this.socket.on('ready', (data) => this.handleReady(data));
        this.socket.on('status_update', (data) => this.handleStatusUpdate(data));
        this.socket.on('bot_status', (data) => this.handleBotStatus(data));
        this.socket.on('connection_update', (data) => this.handleConnectionUpdate(data));
        this.socket.on('auth_result', (data) => this.handleAuthResult(data));
        this.socket.on('logout', (data) => this.handleLogoutEvent(data));
        this.socket.on('logout_success', (data) => this.handleLogoutSuccess(data));
        this.socket.on('qr_refreshed', (data) => this.handleQRRefreshed(data));
        
        // Pairing code events - UPDATED for manual-only
        this.socket.on('pairing_code_generated', (data) => this.handlePairingCodeGenerated(data));
        this.socket.on('pairing_code_error', (data) => this.handlePairingCodeError(data));
        
        // Error events
        this.socket.on('error', (data) => this.handleError(data));
    }

    /**
     * 🔌 Handle Socket.IO connection - UPDATED for manual pairing
     */
    handleSocketConnect() {
        console.log('✅ Socket.IO connected to SAVAGE SCANNER');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        this.updateStatus('connected', 'Connected to scanner server - Manual pairing active');
        this.showNotification('Connected to scanner server - Manual pairing codes only', 'success');
        
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
        
        // Clear QR regeneration timeout
        if (this.qrRegeneration.timeoutId) {
            clearTimeout(this.qrRegeneration.timeoutId);
        }
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
     * 📨 Handle scanner status - UPDATED for manual-only pairing
     */
    handleScannerStatus(data) {
        console.log('📊 Scanner status:', data);
        
        if (data.whatsapp && data.sessionId) {
            this.sessionId = data.sessionId;
            this.updateSessionInfo(data);
        }
        
        // Update pairing code only if manually generated
        if (data.pairingCode && this.scannerState.pairingCodeActive) {
            this.updatePairingCode(data.pairingCode);
        } else {
            // Reset pairing code display for manual-only mode
            this.updatePairingCode(null);
        }
        
        // Setup QR regeneration if QR is active
        if (data.hasQr && !this.qrRegeneration.isRegenerating) {
            this.setupQRRegeneration();
        }
    }

    /**
     * 📱 Handle QR code data - UPDATED: No automatic pairing codes
     */
    handleQRData(data) {
        console.log('📱 QR Data received:', data);
        
        this.scannerState.qrCode = data.qrImage;
        // NEW: Don't set pairing code from QR data - manual only
        this.scannerState.pairingCode = null;
        this.scannerState.pairingCodeActive = false;
        
        // Update phone number if automatically detected
        if (data.phoneNumber) {
            this.scannerState.phoneNumber = data.phoneNumber;
            this.updatePhoneNumberDisplay(data.phoneNumber);
        }
        
        this.updateQRCode(data.qrImage, data.qrRaw);
        // NEW: Reset pairing code display for QR data
        this.updatePairingCode(null);
        
        // Setup QR regeneration
        this.setupQRRegeneration();
        
        // Show status
        this.updateStatus('qr_ready', 'QR code ready - Scan with WhatsApp');
        this.showNotification('✅ QR code generated! Auto-refresh in 30 seconds', 'success');
        
        console.log('📱 QR Code generated - Manual pairing codes only');
    }

    /**
     * 🔄 Handle QR refresh response
     */
    handleQRRefreshed(data) {
        if (data.success) {
            this.showNotification('🔄 QR code refresh initiated', 'info');
            this.updateStatus('waiting_qr', 'Generating new QR code...');
            
            // Reset regeneration timer
            this.setupQRRegeneration();
        } else {
            this.showNotification('❌ Failed to refresh QR code', 'error');
        }
    }

    /**
     * 🆕 Handle pairing code generation response - UPDATED for manual-only
     */
    handlePairingCodeGenerated(data) {
        if (data.success && data.pairingCode) {
            this.scannerState.pairingCode = data.pairingCode;
            this.scannerState.pairingCodeActive = true;
            this.updatePairingCode(data.pairingCode);
            
            this.showNotification(`✅ 8-digit pairing code generated for ${data.phoneNumber || 'manual pairing'}`, 'success');
            this.updateStatus('pairing_ready', '8-digit pairing code ready');
            
            // Enable copy button
            this.updatePairingCodeControls(true);
        }
    }

    /**
     * 🆕 Handle pairing code error
     */
    handlePairingCodeError(data) {
        this.showNotification(`❌ Pairing code error: ${data.error}`, 'error');
        this.scannerState.pairingCodeActive = false;
        this.updatePairingCodeControls(false);
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
        
        this.updateStatus('connected', 'WhatsApp connected and synced!');
        this.updateSessionInfo(data);
        this.updatePhoneNumberDisplay(data.phoneNumber);
        
        this.showNotification('✅ WhatsApp connected successfully! Session active.', 'success');
        
        // Clear QR regeneration when connected
        if (this.qrRegeneration.timeoutId) {
            clearTimeout(this.qrRegeneration.timeoutId);
            this.qrRegeneration.isRegenerating = false;
        }
        
        // Reset pairing code state
        this.scannerState.pairingCodeActive = false;
        this.updatePairingCodeControls(false);
        
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
        
        if (data.phoneNumber) {
            this.scannerState.phoneNumber = data.phoneNumber;
            this.updatePhoneNumberDisplay(data.phoneNumber);
        }
        
        if (data.status === 'syncing') {
            this.showNotification('🔄 Syncing with WhatsApp...', 'warning');
        } else if (data.status === 'waiting_qr') {
            this.showNotification('⏳ Generating QR code...', 'info');
        } else if (data.status === 'qr_ready') {
            this.showNotification('✅ QR code ready for scanning', 'success');
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
     * 🆕 Handle client-side logout cleanup - UPDATED for manual pairing
     */
    handleClientLogout() {
        // Clear local state
        this.isAuthenticated = false;
        this.sessionId = null;
        this.scannerState.phoneNumber = null;
        this.scannerState.qrCode = null;
        this.scannerState.pairingCode = null;
        this.scannerState.status = 'disconnected';
        this.scannerState.pairingPhoneNumber = '';
        this.scannerState.pairingCodeActive = false;
        
        // Clear QR regeneration
        if (this.qrRegeneration.timeoutId) {
            clearTimeout(this.qrRegeneration.timeoutId);
            this.qrRegeneration.isRegenerating = false;
        }
        
        // Clear localStorage
        localStorage.removeItem('savage_session_token');
        localStorage.removeItem('savage_session_ip');
        
        // Reset UI
        this.updateStatus('disconnected', 'Logged out');
        this.updatePhoneNumberDisplay(null);
        this.updatePairingCode(null);
        this.updateQRCode(null, null);
        this.resetPairingInput();
        this.updatePairingCodeControls(false);
        
        // Reset bot statuses
        this.updateBotStatus('SAVAGE-X', 'offline');
        this.updateBotStatus('DE-UKNOWN-BOT', 'offline');
        this.updateBotStatus('QUEEN-RIXIE', 'offline');
        
        console.log('✅ Client logout completed - Manual pairing reset');
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
    updateQRCode(qrImage, qrRaw = null) {
        const qrElement = document.getElementById('qrCode');
        if (!qrElement) return;

        if (qrImage) {
            // Display QR image with regeneration info
            qrElement.innerHTML = `
                <img src="${qrImage}" alt="WhatsApp QR Code" style="max-width: 100%; height: auto; border: 2px solid var(--matrix-green); border-radius: 8px;">
                <div class="qr-regeneration-info">
                    <small>🔄 Auto-refresh in 30 seconds</small>
                </div>
            `;
            
            // Show download button
            const downloadBtn = document.getElementById('downloadQRBtn');
            if (downloadBtn) {
                downloadBtn.style.display = 'inline-block';
                downloadBtn.onclick = () => this.downloadQRCode(qrImage);
            }
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
            // Show loading state
            qrElement.innerHTML = `
                <div class="loading-spinner"></div>
                <p class="loading-text">Generating QR code...</p>
            `;
        }
        
        // Update QR status
        const qrStatus = document.getElementById('qrStatus');
        if (qrStatus) {
            if (qrImage) {
                qrStatus.textContent = 'QR Code Ready - Auto-refresh active';
                qrStatus.className = 'status-connected';
            } else if (qrRaw) {
                qrStatus.textContent = 'Manual Pairing Code Ready';
                qrStatus.className = 'status-waiting';
            } else {
                qrStatus.textContent = 'QR code generating...';
                qrStatus.className = 'status-syncing';
            }
        }
    }

    /**
     * 🆕 Setup QR code auto-regeneration
     */
    setupQRRegeneration() {
        // Clear existing timeout
        if (this.qrRegeneration.timeoutId) {
            clearTimeout(this.qrRegeneration.timeoutId);
        }
        
        // Set new timeout
        this.qrRegeneration.timeoutId = setTimeout(() => {
            if (this.isConnected && this.scannerState.qrCode && this.scannerState.status !== 'connected') {
                this.qrRegeneration.isRegenerating = true;
                this.showNotification('🔄 Auto-refreshing QR code...', 'info');
                this.refreshQR();
                
                // Reset flag after refresh
                setTimeout(() => {
                    this.qrRegeneration.isRegenerating = false;
                }, 2000);
            }
        }, this.qrRegeneration.regenerationTime);
        
        this.qrRegeneration.lastGenerated = new Date();
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
     * 🔢 Update pairing code display - UPDATED for manual-only
     */
    updatePairingCode(pairingCode) {
        const pairingElement = document.getElementById('pairingCode');
        if (pairingElement) {
            pairingElement.textContent = pairingCode || '--------';
            pairingElement.className = pairingCode ? 'pairing-code pairing-code-active' : 'pairing-code pairing-code-inactive';
        }
        
        const pairingStatus = document.getElementById('pairingStatus');
        if (pairingStatus) {
            if (pairingCode) {
                pairingStatus.textContent = '8-digit Pairing Code Ready';
                pairingStatus.className = 'status-connected';
            } else {
                pairingStatus.textContent = 'Enter phone number to generate code';
                pairingStatus.className = 'status-waiting';
            }
        }
    }

    /**
     * 🆕 Update pairing code controls state
     */
    updatePairingCodeControls(isActive) {
        const copyBtn = document.getElementById('copyPairingBtn');
        const generateBtn = document.getElementById('generatePairingBtn');
        const phoneInput = document.getElementById('pairingPhoneInput');
        
        if (copyBtn) {
            copyBtn.disabled = !isActive;
            if (isActive) {
                copyBtn.onclick = () => {
                    const pairingCode = document.getElementById('pairingCode').textContent;
                    if (pairingCode && pairingCode !== '--------') {
                        this.copyPairingCode(pairingCode);
                    }
                };
            }
        }
        
        if (generateBtn && phoneInput) {
            // Generate button enabled only when phone number is valid
            const phoneNumber = phoneInput.value.trim();
            generateBtn.disabled = !this.isValidPhoneNumber(phoneNumber);
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
     * 🆕 Reset pairing input fields
     */
    resetPairingInput() {
        const phoneInput = document.getElementById('pairingPhoneInput');
        if (phoneInput) {
            phoneInput.value = '';
        }
        this.scannerState.pairingPhoneNumber = '';
        this.updatePairingCodeControls(false);
    }

    /**
     * 🆕 Generate 8-digit pairing code - UPDATED for manual-only
     */
    generatePairingCode() {
        const phoneInput = document.getElementById('pairingPhoneInput');
        const phoneNumber = phoneInput ? phoneInput.value.trim() : '';
        
        if (!phoneNumber) {
            this.showNotification('❌ Phone number is REQUIRED for pairing codes', 'error');
            phoneInput.focus();
            return;
        }
        
        if (!this.isValidPhoneNumber(phoneNumber)) {
            this.showNotification('❌ Please enter a valid phone number (e.g., +1234567890)', 'error');
            phoneInput.focus();
            return;
        }
        
        if (this.socket && this.isConnected) {
            this.socket.emit('generate_pairing_code', {
                phoneNumber: phoneNumber,
                timestamp: Date.now(),
                isManual: true // NEW: Always mark as manual
            });
            
            this.showNotification('🔄 Generating 8-digit pairing code...', 'info');
            this.updateStatus('syncing', 'Generating pairing code...');
            
            // Update pairing phone number in state
            this.scannerState.pairingPhoneNumber = phoneNumber;
        } else {
            this.showNotification('❌ Not connected to server', 'error');
        }
    }

    /**
     * 🆕 Validate phone number format
     */
    isValidPhoneNumber(phone) {
        if (!phone || phone.trim() === '') return false;
        // Basic international phone validation
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
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
            'waiting_qr': 'GENERATING QR',
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
        console.log('🦅 Scanner interface active - Manual-only Pairing Mode');
        
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
     * 🎛️ Setup event listeners - UPDATED for manual-only pairing
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

        // Copy pairing code button - Initially disabled
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

        // Generate pairing code button - Initially disabled until phone entered
        const generatePairingBtn = document.getElementById('generatePairingBtn');
        if (generatePairingBtn) {
            generatePairingBtn.disabled = true;
            generatePairingBtn.addEventListener('click', () => this.generatePairingCode());
        }

        // Phone input validation and real-time updates
        const phoneInput = document.getElementById('pairingPhoneInput');
        if (phoneInput) {
            phoneInput.addEventListener('input', () => {
                const phoneNumber = phoneInput.value.trim();
                const isValid = this.isValidPhoneNumber(phoneNumber);
                
                // Update generate button state
                if (generatePairingBtn) {
                    generatePairingBtn.disabled = !isValid;
                }
                
                // Visual feedback
                if (phoneNumber && !isValid) {
                    phoneInput.style.borderColor = 'var(--warning-red)';
                    this.showNotification('❌ Invalid phone number format', 'error');
                } else if (isValid) {
                    phoneInput.style.borderColor = 'var(--matrix-green)';
                } else {
                    phoneInput.style.borderColor = 'var(--accent-blue)';
                }
            });

            // Enter key support
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
     * 🚪 Handle logout
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
            this.showNotification('🔄 Generating new QR code...', 'warning');
            this.updateStatus('waiting_qr', 'Refreshing QR code...');
            
            // Reset regeneration timer
            this.setupQRRegeneration();
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
        if (!pairingCode || pairingCode === '--------') {
            this.showNotification('No pairing code available', 'error');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(pairingCode);
            this.showNotification('8-digit pairing code copied to clipboard!', 'success');
        } catch (error) {
            console.error('❌ Failed to copy pairing code:', error);
            this.showNotification('Failed to copy pairing code', 'error');
        }
    }

    /**
     * ⌨️ Handle keyboard shortcuts - UPDATED for manual pairing
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

        // Ctrl+Shift+Q - Copy pairing code
        if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
            e.preventDefault();
            const pairingCode = document.getElementById('pairingCode').textContent;
            if (pairingCode && pairingCode !== '--------') {
                this.copyPairingCode(pairingCode);
            }
        }

        // Ctrl+Shift+G - Generate pairing code
        if (e.ctrlKey && e.shiftKey && e.key === 'G') {
            e.preventDefault();
            this.generatePairingCode();
        }

        // Ctrl+Shift+D - Download QR
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            if (this.scannerState.qrCode) {
                this.downloadQRCode(this.scannerState.qrCode);
            }
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
     * 🏥 Get scanner health status - UPDATED for manual pairing
     */
    getHealthStatus() {
        return {
            websocket: this.isConnected ? 'connected' : 'disconnected',
            authenticated: this.isAuthenticated,
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
        
        // Clear QR regeneration
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
