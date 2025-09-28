/**
 * 🦅 SAVAGE BOTS SCANNER - Matrix Rain Effects
 * Dynamic matrix code rain animation for hacker theme
 * Green digital rain with burning cards integration
 */

class MatrixEffects {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.matrixChars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        this.drops = [];
        this.animationId = null;
        this.isRunning = false;
        
        // Configuration
        this.config = {
            fontSize: 14,
            columns: 0,
            fadeSpeed: 0.05,
            density: 0.02,
            speed: 2,
            colors: {
                primary: '#00FF00',
                bright: '#39FF14',
                dark: '#003300'
            }
        };
        
        this.init();
    }

    /**
     * 🎯 Initialize matrix effects
     */
    init() {
        this.createCanvas();
        this.setupEventListeners();
        this.start();
        
        console.log('🌌 Matrix effects initialized');
    }

    /**
     * 🎨 Create canvas element
     */
    createCanvas() {
        // Remove existing canvas if present
        const existingCanvas = document.getElementById('matrixCanvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }

        // Create new canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'matrixCanvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.opacity = '0.3';
        
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
    }

    /**
     * 📏 Resize canvas to window size
     */
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.config.columns = Math.floor(this.canvas.width / this.config.fontSize);
        this.initializeDrops();
    }

    /**
     * 💧 Initialize rain drops
     */
    initializeDrops() {
        this.drops = [];
        for (let i = 0; i < this.config.columns; i++) {
            this.drops[i] = {
                y: Math.random() * -this.canvas.height,
                speed: Math.random() * this.config.speed + 1,
                length: Math.floor(Math.random() * 20) + 5,
                chars: this.generateRandomChars(20),
                brightness: Math.random() * 0.5 + 0.5,
                lastUpdate: Date.now()
            };
        }
    }

    /**
     * 🔤 Generate random matrix characters
     */
    generateRandomChars(length) {
        let chars = '';
        for (let i = 0; i < length; i++) {
            chars += this.matrixChars.charAt(
                Math.floor(Math.random() * this.matrixChars.length)
            );
        }
        return chars;
    }

    /**
     * 🎬 Start animation
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.animate();
        
        console.log('🌀 Matrix rain started');
    }

    /**
     * ⏹️ Stop animation
     */
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.isRunning = false;
        
        console.log('🛑 Matrix rain stopped');
    }

    /**
     * 🎞️ Animation loop
     */
    animate() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.font = `${this.config.fontSize}px 'Courier New', monospace`;
        
        this.drops.forEach((drop, index) => {
            this.drawDrop(drop, index);
            this.updateDrop(drop);
        });
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    /**
     * ✍️ Draw a single rain drop
     */
    drawDrop(drop, columnIndex) {
        const x = columnIndex * this.config.fontSize;
        
        for (let i = 0; i < drop.length; i++) {
            const charY = drop.y + (i * this.config.fontSize);
            
            // Skip if outside canvas
            if (charY < -this.config.fontSize || charY > this.canvas.height) {
                continue;
            }
            
            // Calculate brightness based on position in drop
            const brightness = this.calculateBrightness(i, drop.length, drop.brightness);
            const color = this.getColor(brightness);
            
            this.ctx.fillStyle = color;
            this.ctx.fillText(drop.chars.charAt(i), x, charY);
            
            // Add glow effect for head character
            if (i === 0) {
                this.ctx.shadowColor = color;
                this.ctx.shadowBlur = 10;
                this.ctx.fillText(drop.chars.charAt(i), x, charY);
                this.ctx.shadowBlur = 0;
            }
        }
    }

    /**
     * 💡 Calculate character brightness
     */
    calculateBrightness(position, length, baseBrightness) {
        // Head is brightest
        if (position === 0) return baseBrightness;
        
        // Trail fades out
        const fade = 1 - (position / length);
        return baseBrightness * fade * 0.7;
    }

    /**
     * 🎨 Get color based on brightness
     */
    getColor(brightness) {
        if (brightness > 0.8) {
            return this.config.colors.bright;
        } else if (brightness > 0.4) {
            return this.config.colors.primary;
        } else {
            return this.config.colors.dark;
        }
    }

    /**
     * 🔄 Update drop position and properties
     */
    updateDrop(drop) {
        drop.y += drop.speed;
        
        // Reset drop when it goes off screen
        if (drop.y - (drop.length * this.config.fontSize) > this.canvas.height) {
            this.resetDrop(drop);
        }
        
        // Occasionally change brightness for flicker effect
        const now = Date.now();
        if (now - drop.lastUpdate > 1000) {
            drop.brightness = Math.random() * 0.5 + 0.5;
            drop.lastUpdate = now;
        }
    }

    /**
     * 🔁 Reset a drop to top
     */
    resetDrop(drop) {
        drop.y = Math.random() * -100;
        drop.speed = Math.random() * this.config.speed + 1;
        drop.length = Math.floor(Math.random() * 20) + 5;
        drop.chars = this.generateRandomChars(20);
        drop.brightness = Math.random() * 0.5 + 0.5;
    }

    /**
     * ⚙️ Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.fontSize || newConfig.columns) {
            this.resizeCanvas();
        }
        
        console.log('⚙️ Matrix config updated:', this.config);
    }

    /**
     * 🎚️ Set effect intensity
     */
    setIntensity(intensity) {
        // intensity: 0 (min) to 1 (max)
        const newConfig = {
            density: intensity * 0.03,
            speed: intensity * 3 + 1,
            fadeSpeed: intensity * 0.08
        };
        
        this.updateConfig(newConfig);
    }

    /**
     * 🌈 Change color scheme
     */
    setColorScheme(scheme) {
        const schemes = {
            matrix: {
                primary: '#00FF00',
                bright: '#39FF14',
                dark: '#003300'
            },
            cyber: {
                primary: '#00FFFF',
                bright: '#00FFCC',
                dark: '#003333'
            },
            warning: {
                primary: '#FF0000',
                bright: '#FF3333',
                dark: '#330000'
            },
            royal: {
                primary: '#FF00FF',
                bright: '#FF33FF',
                dark: '#330033'
            }
        };
        
        if (schemes[scheme]) {
            this.config.colors = schemes[scheme];
            console.log(`🎨 Color scheme changed to: ${scheme}`);
        }
    }

    /**
     * 🔥 Add burning effect overlay
     */
    addBurningEffect() {
        const burningOverlay = document.createElement('div');
        burningOverlay.id = 'burningOverlay';
        burningOverlay.style.position = 'fixed';
        burningOverlay.style.top = '0';
        burningOverlay.style.left = '0';
        burningOverlay.style.width = '100%';
        burningOverlay.style.height = '100%';
        burningOverlay.style.background = `
            radial-gradient(circle at 20% 80%, rgba(255, 100, 0, 0.1) 0%, transparent 40%),
            radial-gradient(circle at 80% 20%, rgba(255, 50, 0, 0.1) 0%, transparent 40%),
            linear-gradient(45deg, rgba(255, 0, 0, 0.05) 0%, transparent 50%)
        `;
        burningOverlay.style.pointerEvents = 'none';
        burningOverlay.style.zIndex = '-1';
        burningOverlay.style.mixBlendMode = 'overlay';
        burningOverlay.style.animation = 'burningPulse 4s ease-in-out infinite';
        
        // Add CSS animation
        if (!document.getElementById('burningAnimation')) {
            const style = document.createElement('style');
            style.id = 'burningAnimation';
            style.textContent = `
                @keyframes burningPulse {
                    0%, 100% { 
                        opacity: 0.3;
                        filter: hue-rotate(0deg);
                    }
                    50% { 
                        opacity: 0.6;
                        filter: hue-rotate(45deg);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(burningOverlay);
        console.log('🔥 Burning effect added');
    }

    /**
     * 🌀 Add vortex effect
     */
    addVortexEffect() {
        const vortexOverlay = document.createElement('div');
        vortexOverlay.id = 'vortexOverlay';
        vortexOverlay.style.position = 'fixed';
        vortexOverlay.style.top = '50%';
        vortexOverlay.style.left = '50%';
        vortexOverlay.style.width = '200%';
        vortexOverlay.style.height = '200%';
        vortexOverlay.style.background = `
            radial-gradient(circle, transparent 30%, rgba(0, 255, 0, 0.1) 70%),
            conic-gradient(from 0deg, transparent, rgba(0, 255, 0, 0.05), transparent)
        `;
        vortexOverlay.style.pointerEvents = 'none';
        vortexOverlay.style.zIndex = '-1';
        vortexOverlay.style.mixBlendMode = 'screen';
        vortexOverlay.style.transform = 'translate(-50%, -50%)';
        vortexOverlay.style.animation = 'vortexSpin 20s linear infinite';
        
        // Add CSS animation
        if (!document.getElementById('vortexAnimation')) {
            const style = document.createElement('style');
            style.id = 'vortexAnimation';
            style.textContent = `
                @keyframes vortexSpin {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(vortexOverlay);
        console.log('🌀 Vortex effect added');
    }

    /**
     * ⚡ Add lightning effect
     */
    addLightningEffect() {
        setInterval(() => {
            if (Math.random() > 0.98) { // 2% chance every interval
                this.flashLightning();
            }
        }, 1000);
        
        console.log('⚡ Lightning effect enabled');
    }

    /**
     * 💥 Flash lightning
     */
    flashLightning() {
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.background = 'rgba(255, 255, 255, 0.3)';
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '9999';
        flash.style.animation = 'lightningFlash 0.2s ease-out';
        
        // Add CSS animation
        if (!document.getElementById('lightningAnimation')) {
            const style = document.createElement('style');
            style.id = 'lightningAnimation';
            style.textContent = `
                @keyframes lightningFlash {
                    0% { opacity: 0; }
                    50% { opacity: 0.3; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(flash);
        
        // Remove after animation
        setTimeout(() => {
            if (flash.parentNode) {
                flash.parentNode.removeChild(flash);
            }
        }, 200);
    }

    /**
     * 🎛️ Setup event listeners
     */
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });

        // Visibility change (pause when tab not active)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop();
            } else {
                this.start();
            }
        });

        // Keyboard controls for debugging
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey) {
                switch(e.key) {
                    case 'M':
                        e.preventDefault();
                        this.toggleMatrix();
                        break;
                    case 'C':
                        e.preventDefault();
                        this.cycleColorScheme();
                        break;
                    case 'I':
                        e.preventDefault();
                        this.toggleIntensity();
                        break;
                }
            }
        });

        console.log('🎛️ Matrix event listeners setup complete');
    }

    /**
     * 🔄 Toggle matrix on/off
     */
    toggleMatrix() {
        if (this.isRunning) {
            this.stop();
            this.canvas.style.display = 'none';
        } else {
            this.canvas.style.display = 'block';
            this.start();
        }
        console.log(`🌀 Matrix ${this.isRunning ? 'enabled' : 'disabled'}`);
    }

    /**
     * 🎨 Cycle through color schemes
     */
    cycleColorScheme() {
        const schemes = ['matrix', 'cyber', 'warning', 'royal'];
        const currentIndex = schemes.findIndex(scheme => 
            this.config.colors.primary === this.getSchemeColors(scheme).primary
        );
        const nextIndex = (currentIndex + 1) % schemes.length;
        this.setColorScheme(schemes[nextIndex]);
    }

    /**
     * 🎨 Get scheme colors
     */
    getSchemeColors(scheme) {
        const schemes = {
            matrix: { primary: '#00FF00', bright: '#39FF14', dark: '#003300' },
            cyber: { primary: '#00FFFF', bright: '#00FFCC', dark: '#003333' },
            warning: { primary: '#FF0000', bright: '#FF3333', dark: '#330000' },
            royal: { primary: '#FF00FF', bright: '#FF33FF', dark: '#330033' }
        };
        return schemes[scheme] || schemes.matrix;
    }

    /**
     | 🎚️ Toggle intensity
     */
    toggleIntensity() {
        const intensities = [0.3, 0.6, 1.0];
        const currentIntensity = this.config.density / 0.03;
        const nextIntensity = intensities[(intensities.indexOf(currentIntensity) + 1) % intensities.length];
        this.setIntensity(nextIntensity);
    }

    /**
     * 🧹 Cleanup and destroy
     */
    destroy() {
        this.stop();
        
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        // Remove overlays
        const overlays = ['burningOverlay', 'vortexOverlay'];
        overlays.forEach(id => {
            const element = document.getElementById(id);
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        
        // Remove styles
        const styles = ['burningAnimation', 'vortexAnimation', 'lightningAnimation'];
        styles.forEach(id => {
            const element = document.getElementById(id);
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        
        console.log('🧹 Matrix effects destroyed');
    }

    /**
     * 📊 Get performance stats
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            columns: this.config.columns,
            drops: this.drops.length,
            fps: this.getFPS(),
            intensity: this.config.density / 0.03
        };
    }

    /**
     * 📈 Calculate FPS
     */
    getFPS() {
        // Simple FPS calculation would go here
        return '60'; // Placeholder
    }
}

// Initialize matrix effects when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.savageMatrix = new MatrixEffects();
    
    // Add additional effects based on page
    if (document.getElementById('scannerInterface')) {
        window.savageMatrix.addBurningEffect();
        window.savageMatrix.addVortexEffect();
        window.savageMatrix.addLightningEffect();
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MatrixEffects;
}
