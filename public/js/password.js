/**
 * 🦅 SAVAGE BOTS SCANNER - Password Authentication Frontend
 * Hacker-themed password portal with security features
 * Burning cards background with matrix effects
 */

class SavagePasswordAuth {
    constructor() {
        this.attempts = 0;
        this.maxAttempts = 5;
        this.lockoutTime = 15 * 60 * 1000; // 15 minutes
        this.isLocked = false;
        this.lockoutUntil = null;
        
        this.init();
    }

    /**
     * 🎯 Initialize password authentication
     */
    init() {
        console.log('🔐 Initializing SAVAGE Password Authentication...');
        
        this.checkExistingLock();
        this.setupEventListeners();
        this.setupAnimations();
        this.startSecurityMonitor();
        
        // Initialize matrix effects for password page
        if (window.savageMatrix) {
            window.savageMatrix.setColorScheme('matrix');
            window.savageMatrix.setIntensity(0.6);
            window.savageMatrix.addBurningEffect();
        }
    }

    /**
     * 🔒 Check existing lock status
     */
    checkExistingLock() {
        const lockTime = localStorage.getItem('savage_lockout_until');
        
        if (lockTime && Date.now() < parseInt(lockTime)) {
            this.isLocked = true;
            this.lockoutUntil = parseInt(lockTime);
            this.updateLockoutDisplay();
        } else {
            // Clear expired lock
            localStorage.removeItem('savage_lockout_until');
            localStorage.removeItem('savage_attempts');
        }
        
        // Load attempt count
        this.attempts = parseInt(localStorage.getItem('savage_attempts')) || 0;
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

        // Password input events
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) {
            passwordInput.addEventListener('input', () => this.handlePasswordInput());
            passwordInput.addEventListener('keydown', (e) => this.handlePasswordKeydown(e));
            passwordInput.addEventListener('focus', () => this.handlePasswordFocus());
            passwordInput.addEventListener('blur', () => this.handlePasswordBlur());
        }

        // View password toggle
        const viewPasswordBtn = document.getElementById('viewPasswordBtn');
        if (viewPasswordBtn) {
            viewPasswordBtn.addEventListener('click', () => this.togglePasswordVisibility());
        }

        // Security tips toggle
        const securityTipsBtn = document.getElementById('securityTipsBtn');
        if (securityTipsBtn) {
            securityTipsBtn.addEventListener('click', () => this.toggleSecurityTips());
        }

        // Emergency access (hidden feature)
        document.addEventListener('keydown', (e) => this.handleEmergencyAccess(e));

        // Window focus/blur for security
        window.addEventListener('blur', () => this.handleWindowBlur());
        window.addEventListener('focus', () => this.handleWindowFocus());

        console.log('🎛️ Password event listeners setup complete');
    }

    /**
     * 🎨 Setup animations and effects
     */
    setupAnimations() {
        // Terminal typing effect for title
        this.typeWriterEffect();
        
        // Pulsing glow effect for logo
        this.startLogoAnimation();
        
        // Background particle effect
        this.startParticleEffect();
        
        // Random security messages
        this.startSecurityMessages();
    }

    /**
     * ⌨️ Typewriter effect for title
     */
    typeWriterEffect() {
        const title = document.querySelector('.portal-title');
        if (!title) return;

        const text = title.textContent;
        title.textContent = '';
        title.style.borderRight = '2px solid #00FF00';

        let i = 0;
        const typeWriter = () => {
            if (i < text.length) {
                title.textContent += text.charAt(i);
                i++;
                setTimeout(typeWriter, 100);
            } else {
                // Blinking cursor after typing
                setInterval(() => {
                    title.style.borderRightColor = title.style.borderRightColor === 'transparent' ? '#00FF00' : 'transparent';
                }, 500);
            }
        };

        // Start typing after a delay
        setTimeout(typeWriter, 1000);
    }

    /**
     * 💫 Logo pulsing animation
     */
    startLogoAnimation() {
        const logo = document.querySelector('.savage-logo');
        if (!logo) return;

        setInterval(() => {
            logo.style.filter = logo.style.filter.includes('25px') 
                ? 'drop-shadow(0 0 15px #00FF00)' 
                : 'drop-shadow(0 0 25px #39FF14)';
        }, 2000);
    }

    /**
     * ✨ Background particle effect
     */
    startParticleEffect() {
        const container = document.querySelector('.password-portal');
        if (!container) return;

        for (let i = 0; i < 20; i++) {
            this.createParticle(container);
        }
    }

    /**
     * 🔹 Create a single particle
     */
    createParticle(container) {
        const particle = document.createElement('div');
        particle.style.position = 'absolute';
        particle.style.width = '2px';
        particle.style.height = '2px';
        particle.style.background = '#00FF00';
        particle.style.borderRadius = '50%';
        particle.style.opacity = '0';
        
        // Random position
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        particle.style.left = `${posX}%`;
        particle.style.top = `${posY}%`;
        
        container.appendChild(particle);
        
        // Animate particle
        this.animateParticle(particle);
    }

    /**
     * 🎞️ Animate particle movement
     */
    animateParticle(particle) {
        const duration = Math.random() * 5 + 3;
        const delay = Math.random() * 5;
        
        particle.style.transition = `all ${duration}s linear ${delay}s`;
        particle.style.opacity = '0.7';
        
        // Move particle
        setTimeout(() => {
            const newX = Math.random() * 100;
            const newY = Math.random() * 100;
            particle.style.left = `${newX}%`;
            particle.style.top = `${newY}%`;
        }, 50);
        
        // Restart animation
        setTimeout(() => {
            particle.style.opacity = '0';
            setTimeout(() => {
                particle.style.transition = 'none';
                const startX = Math.random() * 100;
                const startY = Math.random() * 100;
                particle.style.left = `${startX}%`;
                particle.style.top = `${startY}%`;
                
                setTimeout(() => this.animateParticle(particle), 1000);
            }, 1000);
        }, (duration + delay) * 1000);
    }

    /**
     * 💬 Random security messages
     */
    startSecurityMessages() {
        const messages = [
            "🔐 Authentication Required",
            "🦅 SAVAGE BOTS Security",
            "⚠️ Unauthorized Access Prohibited",
            "🚫 Multiple Failed Attempts Will Trigger Lockout",
            "📡 Secure Connection Established",
            "🛡️ Advanced Threat Protection Active",
            "🌐 Encrypted Session Channel",
            "⚡ High-Security Authentication Protocol"
        ];

        const subtitle = document.querySelector('.portal-subtitle');
        if (!subtitle) return;

        let currentIndex = 0;
        
        setInterval(() => {
            subtitle.style.opacity = '0';
            
            setTimeout(() => {
                currentIndex = (currentIndex + 1) % messages.length;
                subtitle.textContent = messages[currentIndex];
                subtitle.style.opacity = '1';
            }, 500);
            
        }, 4000);
    }

    /**
     * 🔑 Handle password form submission
     */
    handlePasswordSubmit(e) {
        e.preventDefault();
        
        if (this.isLocked) {
            this.showLockoutMessage();
            return;
        }

        const passwordInput = document.getElementById('passwordInput');
        const password = passwordInput.value.trim();

        if (!password) {
            this.showMessage('Please enter the access password', 'error');
            this.shakeInput(passwordInput);
            return;
        }

        // Show loading state
        this.setLoadingState(true);
        
        // Simulate authentication process
        this.authenticatePassword(password);
    }

    /**
     * 🔐 Authenticate password
     */
    async authenticatePassword(password) {
        try {
            // Show security scanning animation
            this.showSecurityScan();
            
            // Simulate server communication delay
            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
            
            // For demo purposes - in production, this would communicate with the server
            const isValid = await this.validateWithServer(password);
            
            if (isValid) {
                await this.handleSuccessfulAuth();
            } else {
                await this.handleFailedAuth();
            }
            
        } catch (error) {
            console.error('❌ Authentication error:', error);
            this.showMessage('Authentication system error', 'error');
            this.setLoadingState(false);
        }
    }

    /**
     * 🌐 Validate password with server (simulated)
     */
    async validateWithServer(password) {
        // In a real implementation, this would make a fetch request to the server
        // For now, we'll simulate server validation
        
        return new Promise((resolve) => {
            // Simulate network delay
            setTimeout(() => {
                // This is where you would make the actual API call
                // For demo, we'll use a mock validation
                const isValid = this.mockPasswordValidation(password);
                resolve(isValid);
            }, 800);
        });
    }

    /**
     * 🎯 Mock password validation
     */
    mockPasswordValidation(password) {
        // In production, this would be handled by the server
        // For now, we'll check against the expected password pattern
        const expectedPassword = '$S.Bots_2022@_';
        return password === expectedPassword;
    }

    /**
     * ✅ Handle successful authentication
     */
    async handleSuccessfulAuth() {
        // Reset attempts on success
        this.attempts = 0;
        localStorage.removeItem('savage_attempts');
        localStorage.removeItem('savage_lockout_until');
        
        // Show success animation
        this.showSuccessAnimation();
        
        // Store session token (in real implementation, this would come from server)
        const sessionToken = this.generateSessionToken();
        localStorage.setItem('savage_session_token', sessionToken);
        localStorage.setItem('savage_session_ip', this.getClientIP());
        
        // Log successful attempt
        this.logSecurityEvent('SUCCESS', 'Password accepted');
        
        // Redirect to scanner interface
        setTimeout(() => {
            window.location.href = '/scanner';
        }, 2000);
    }

    /**
     * ❌ Handle failed authentication
     */
    async handleFailedAuth() {
        this.attempts++;
        localStorage.setItem('savage_attempts', this.attempts.toString());
        
        // Log failed attempt
        this.logSecurityEvent('FAILED', `Failed attempt ${this.attempts}/${this.maxAttempts}`);
        
        if (this.attempts >= this.maxAttempts) {
            await this.handleLockout();
        } else {
            this.showMessage(`Invalid password. ${this.maxAttempts - this.attempts} attempts remaining.`, 'error');
            this.shakeInput(document.getElementById('passwordInput'));
            this.setLoadingState(false);
        }
    }

    /**
     * 🔒 Handle account lockout
     */
    async handleLockout() {
        this.isLocked = true;
        this.lockoutUntil = Date.now() + this.lockoutTime;
        localStorage.setItem('savage_lockout_until', this.lockoutUntil.toString());
        
        // Log lockout event
        this.logSecurityEvent('LOCKOUT', `IP locked for ${this.lockoutTime/1000/60} minutes`);
        
        this.showLockoutMessage();
        this.setLoadingState(false);
        
        // Trigger security alert
        this.triggerSecurityAlert();
    }

    /**
     * 🚨 Trigger security alert
     */
    triggerSecurityAlert() {
        // Visual alert
        document.body.style.animation = 'securityAlert 0.5s ease-in-out 3';
        
        // Add CSS for alert animation
        if (!document.getElementById('securityAlertStyle')) {
            const style = document.createElement('style');
            style.id = 'securityAlertStyle';
            style.textContent = `
                @keyframes securityAlert {
                    0%, 100% { background-color: transparent; }
                    50% { background-color: rgba(255, 0, 0, 0.1); }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Console warning
        console.warn('🚨 SECURITY ALERT: Multiple failed authentication attempts detected');
    }

    /**
     * 📝 Handle password input
     */
    handlePasswordInput() {
        const passwordInput = document.getElementById('passwordInput');
        const strengthIndicator = document.getElementById('passwordStrength');
        
        if (strengthIndicator) {
            const strength = this.calculatePasswordStrength(passwordInput.value);
            this.updateStrengthIndicator(strengthIndicator, strength);
        }
    }

    /**
     * 💪 Calculate password strength
     */
    calculatePasswordStrength(password) {
        let strength = 0;
        
        if (password.length >= 8) strength += 1;
        if (password.match(/[a-z]/)) strength += 1;
        if (password.match(/[A-Z]/)) strength += 1;
        if (password.match(/[0-9]/)) strength += 1;
        if (password.match(/[^a-zA-Z0-9]/)) strength += 1;
        
        return strength;
    }

    /**
     * 📊 Update strength indicator
     */
    updateStrengthIndicator(indicator, strength) {
        const colors = ['#FF0000', '#FF3300', '#FF6600', '#FF9900', '#00FF00'];
        const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
        
        indicator.style.width = `${(strength / 5) * 100}%`;
        indicator.style.background = colors[strength - 1] || '#FF0000';
        
        // Update label if exists
        const label = document.getElementById('passwordStrengthLabel');
        if (label) {
            label.textContent = labels[strength - 1] || 'Very Weak';
            label.style.color = colors[strength - 1] || '#FF0000';
        }
    }

    /**
     * ⌨️ Handle password keydown events
     */
    handlePasswordKeydown(e) {
        // Block certain keys for security
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault(); // Block view source
            this.showMessage('Security feature activated', 'warning');
        }
        
        // Enter key to submit
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('passwordForm').dispatchEvent(new Event('submit'));
        }
    }

    /**
     * 🔍 Handle password focus
     */
    handlePasswordFocus() {
        const input = document.getElementById('passwordInput');
        input.style.boxShadow = '0 0 20px #00FF00';
        input.style.borderColor = '#39FF14';
    }

    /**
     * 🔍 Handle password blur
     */
    handlePasswordBlur() {
        const input = document.getElementById('passwordInput');
        input.style.boxShadow = '';
        input.style.borderColor = '#00FF00';
    }

    /**
     * 👁️ Toggle password visibility
     */
    togglePasswordVisibility() {
        const input = document.getElementById('passwordInput');
        const button = document.getElementById('viewPasswordBtn');
        
        if (input.type === 'password') {
            input.type = 'text';
            button.textContent = '🙈';
            button.title = 'Hide Password';
        } else {
            input.type = 'password';
            button.textContent = '👁️';
            button.title = 'Show Password';
        }
    }

    /**
     * 💡 Toggle security tips
     */
    toggleSecurityTips() {
        const tips = document.getElementById('securityTips');
        const button = document.getElementById('securityTipsBtn');
        
        if (tips.style.display === 'none') {
            tips.style.display = 'block';
            button.textContent = '🔒 Hide Tips';
        } else {
            tips.style.display = 'none';
            button.textContent = '💡 Security Tips';
        }
    }

    /**
     * 🚨 Handle emergency access
     */
    handleEmergencyAccess(e) {
        // Hidden feature: Ctrl+Shift+E for emergency access info
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            this.showEmergencyInfo();
        }
    }

    /**
     * 🆘 Show emergency access information
     */
    showEmergencyInfo() {
        const emergencyInfo = `
            🆘 EMERGENCY ACCESS INFORMATION
            
            🔐 System: SAVAGE BOTS SCANNER
            🌐 Server: ${window.location.hostname}
            🕒 Local Time: ${new Date().toLocaleString()}
            🖥️ User Agent: ${navigator.userAgent}
            🌍 Language: ${navigator.language}
            
            📞 Contact Administrator for assistance.
            
            🚨 SECURITY NOTICE: This information is logged.
        `;
        
        console.info(emergencyInfo);
        this.showMessage('Emergency information logged to console', 'warning');
    }

    /**
     * 🪟 Handle window blur (user switches away)
     */
    handleWindowBlur() {
        // Log when user leaves the page
        this.logSecurityEvent('PAGE_BLUR', 'User switched away from password page');
    }

    /**
     * 🪟 Handle window focus (user returns)
     */
    handleWindowFocus() {
        // Log when user returns to the page
        this.logSecurityEvent('PAGE_FOCUS', 'User returned to password page');
    }

    /**
     * ⏳ Set loading state
     */
    setLoadingState(loading) {
        const submitBtn = document.querySelector('#passwordForm button[type="submit"]');
        const passwordInput = document.getElementById('passwordInput');
        
        if (loading) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '🔐 AUTHENTICATING...';
            passwordInput.disabled = true;
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🔓 ACCESS SYSTEM';
            passwordInput.disabled = false;
        }
    }

    /**
     * 🔍 Show security scan animation
     */
    showSecurityScan() {
        const scanBar = document.createElement('div');
        scanBar.style.position = 'absolute';
        scanBar.style.top = '0';
        scanBar.style.left = '0';
        scanBar.style.width = '100%';
        scanBar.style.height = '3px';
        scanBar.style.background = 'linear-gradient(90deg, #00FF00, #39FF14)';
        scanBar.style.zIndex = '1000';
        scanBar.style.animation = 'securityScan 2s ease-in-out';
        
        document.querySelector('.portal-container').appendChild(scanBar);
        
        // Remove after animation
        setTimeout(() => {
            if (scanBar.parentNode) {
                scanBar.parentNode.removeChild(scanBar);
            }
        }, 2000);
        
        // Add CSS for scan animation
        if (!document.getElementById('securityScanStyle')) {
            const style = document.createElement('style');
            style.id = 'securityScanStyle';
            style.textContent = `
                @keyframes securityScan {
                    0% { transform: translateY(0); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateY(400px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * ✅ Show success animation
     */
    showSuccessAnimation() {
        const container = document.querySelector('.portal-container');
        
        // Add success checkmark
        const successIcon = document.createElement('div');
        successIcon.style.fontSize = '4rem';
        successIcon.style.textAlign = 'center';
        successIcon.style.margin = '20px 0';
        successIcon.style.animation = 'successPulse 1s ease-in-out';
        successIcon.innerHTML = '✅';
        
        const message = document.createElement('div');
        message.style.textAlign = 'center';
        message.style.fontSize = '1.2rem';
        message.style.color = '#39FF14';
        message.textContent = 'ACCESS GRANTED';
        
        container.appendChild(successIcon);
        container.appendChild(message);
        
        // Add CSS for success animation
        if (!document.getElementById('successAnimationStyle')) {
            const style = document.createElement('style');
            style.id = 'successAnimationStyle';
            style.textContent = `
                @keyframes successPulse {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * 💬 Show message to user
     */
    showMessage(text, type = 'info') {
        // Remove existing messages
        const existingMsg = document.getElementById('authMessage');
        if (existingMsg) {
            existingMsg.remove();
        }
        
        // Create new message
        const message = document.createElement('div');
        message.id = 'authMessage';
        message.className = `alert alert-${type}`;
        message.innerHTML = `
            <strong>${type.toUpperCase()}:</strong> ${text}
        `;
        
        // Add to form
        const form = document.getElementById('passwordForm');
        form.appendChild(message);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (message.parentNode) {
                message.parentNode.removeChild(message);
            }
        }, 5000);
    }

    /**
     * 🔒 Show lockout message
     */
    showLockoutMessage() {
        const remainingTime = Math.ceil((this.lockoutUntil - Date.now()) / 1000 / 60);
        
        this.showMessage(
            `Access temporarily locked. Try again in ${remainingTime} minutes.`,
            'error'
        );
        
        this.updateLockoutDisplay();
    }

    /**
     * 🕒 Update lockout display
     */
    updateLockoutDisplay() {
        const passwordInput = document.getElementById('passwordInput');
        const submitBtn = document.querySelector('#passwordForm button[type="submit"]');
        
        if (this.isLocked) {
            const remainingTime = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
            passwordInput.disabled = true;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `🔒 LOCKED (${Math.ceil(remainingTime / 60)}m)`;
            passwordInput.placeholder = `Locked for ${Math.ceil(remainingTime / 60)} minutes`;
        }
    }

    /**
     * 🌀 Shake input for error feedback
     */
    shakeInput(input) {
        input.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            input.style.animation = '';
        }, 500);
        
        // Add shake animation CSS
        if (!document.getElementById('shakeAnimationStyle')) {
            const style = document.createElement('style');
            style.id = 'shakeAnimationStyle';
            style.textContent = `
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * 🎫 Generate session token
     */
    generateSessionToken() {
        return 'savage_' + Math.random().toString(36).substr(2) + '_' + Date.now().toString(36);
    }

    /**
     * 🌐 Get client IP (simulated)
     */
    getClientIP() {
        // In a real implementation, this would get the actual client IP
        // For now, we'll generate a mock IP for demonstration
        return '192.168.1.' + Math.floor(Math.random() * 255);
    }

    /**
     * 📝 Log security event
     */
    logSecurityEvent(type, message) {
        const event = {
            type,
            message,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        console.log(`🔐 [AUTH-${type}] ${message}`);
        
        // In production, this would send to a logging service
        // For now, we'll just log to console
    }

    /**
     * 🛡️ Start security monitor
     */
    startSecurityMonitor() {
        // Monitor for dev tools opening
        setInterval(() => {
            const widthThreshold = window.outerWidth - window.innerWidth > 160;
            const heightThreshold = window.outerHeight - window.innerHeight > 160;
            
            if (widthThreshold || heightThreshold) {
                this.logSecurityEvent('SECURITY', 'Developer tools detected');
            }
        }, 1000);
        
        console.log('🛡️ Security monitor started');
    }

    /**
     * 🧹 Cleanup and destroy
     */
    destroy() {
        // Clean up any intervals or event listeners
        localStorage.removeItem('savage_attempts');
        localStorage.removeItem('savage_lockout_until');
        
        console.log('🧹 SavagePasswordAuth destroyed');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.savagePasswordAuth = new SavagePasswordAuth();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SavagePasswordAuth;
}
