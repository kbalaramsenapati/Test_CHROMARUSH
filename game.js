// CHROMA RUSH - Pure JavaScript Version with Multi-Platform SDK Support
// This file is production-ready for Poki, CrazyGames, GameDistribution, and standalone play

// ============================================================================
// SDK MANAGER - Handles all platform SDKs
// ============================================================================

const SDKManager = {
    platform: 'standalone',
    sdk: null,
    initialized: false,
    
    async init() {
        console.log('Initializing SDK Manager...');
        
        // Detect and initialize platform SDK
        if (typeof PokiSDK !== 'undefined') {
            this.platform = 'poki';
            await PokiSDK.init();
            this.sdk = PokiSDK;
            PokiSDK.gameLoadingFinished();
            console.log('✅ Poki SDK initialized');
        } 
        else if (typeof window.CrazyGames !== 'undefined') {
            this.platform = 'crazygames';
            this.sdk = window.CrazyGames.SDK;
            await this.sdk.init();
            console.log('✅ CrazyGames SDK initialized');
        }
        else if (typeof gdsdk !== 'undefined') {
            this.platform = 'gamedistribution';
            this.sdk = gdsdk;
            console.log('✅ GameDistribution SDK initialized');
        }
        else {
            console.log('✅ Standalone mode (no SDK)');
        }
        
        this.initialized = true;
        return this.platform;
    },
    
    gameplayStart() {
        if (this.platform === 'poki' && this.sdk) {
            this.sdk.gameplayStart();
        } else if (this.platform === 'crazygames' && this.sdk) {
            this.sdk.game.gameplayStart();
        }
    },
    
    gameplayStop() {
        if (this.platform === 'poki' && this.sdk) {
            this.sdk.gameplayStop();
        } else if (this.platform === 'crazygames' && this.sdk) {
            this.sdk.game.gameplayStop();
        }
    },
    
    async showRewardedAd(onReward, onError) {
        console.log('Showing rewarded ad...');
        
        if (this.platform === 'poki' && this.sdk) {
            try {
                const success = await this.sdk.rewardedBreak();
                if (success) onReward();
                else onError();
            } catch (e) {
                onError();
            }
        } 
        else if (this.platform === 'crazygames' && this.sdk) {
            this.sdk.ad.requestAd('rewarded', {
                adFinished: () => onReward(),
                adError: () => onError(),
                adStarted: () => console.log('Ad started')
            });
        }
        else if (this.platform === 'gamedistribution' && this.sdk) {
            try {
                await this.sdk.showAd('rewarded');
                onReward();
            } catch (e) {
                onError();
            }
        }
        else {
            // No SDK - testing mode, auto-reward
            console.log('No SDK - auto-granting reward');
            setTimeout(onReward, 100);
        }
    },
    
    async showMidgameAd() {
        if (this.platform === 'poki' && this.sdk) {
            await this.sdk.commercialBreak();
        } else if (this.platform === 'crazygames' && this.sdk) {
            await this.sdk.ad.requestAd('midgame');
        }
    }
};

// ============================================================================
// GAME STATE
// ============================================================================

const Game = {
    canvas: null,
    ctx: null,
    state: 'menu', // menu, playing, gameOver
    
    colorIndex: 0,
    colors: ['#FF0040', '#00F0FF', '#FFE000'], // Red, Blue, Yellow
    colorNames: ['RED', 'BLUE', 'YELLOW'],
    
    player: { x: 400, y: 500, radius: 30 },
    gates: [],
    particles: [],
    
    speed: 3,
    score: 0,
    highScore: 0,
    multiplier: 1,
    combo: 0,
    
    time: 0,
    lastGateTime: 0,
    gateSpawnInterval: 120,
    
    animationId: null,
    resizeTimeout: null,
    
    // Responsive settings
    canvasScale: { x: 1, y: 1, displayWidth: 800, displayHeight: 600 },
    fontSize: { hud: 40, menu: 60, gameOver: 60 },
    mobileMode: false,
    
    // Settings
    soundEnabled: true,
    
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Load high score
        const saved = localStorage.getItem('chromaRushHighScore');
        if (saved) this.highScore = parseInt(saved);
        
        // Set up responsive canvas
        this.setupResponsiveCanvas();
        
        // Event listeners
        this.canvas.addEventListener('click', () => this.handleInput());
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleInput();
        }, { passive: false });
        
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                this.handleInput();
            }
        });
        
        // Handle orientation and resize
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.handleResize(), 100);
        });
        
        console.log('Game initialized');
    },
    
    setupResponsiveCanvas() {
        // Get container dimensions
        const container = document.getElementById('canvasContainer');
        const rect = container.getBoundingClientRect();
        
        // Base game dimensions (internal resolution)
        const baseWidth = 800;
        const baseHeight = 600;
        const aspectRatio = baseWidth / baseHeight;
        
        // Available space
        const availableWidth = rect.width;
        const availableHeight = rect.height;
        
        // Calculate dimensions that fit while maintaining aspect ratio
        let displayWidth, displayHeight;
        
        // Try fitting by width first
        displayWidth = availableWidth;
        displayHeight = displayWidth / aspectRatio;
        
        // If height doesn't fit, fit by height instead
        if (displayHeight > availableHeight) {
            displayHeight = availableHeight;
            displayWidth = displayHeight * aspectRatio;
        }
        
        // Ensure we don't exceed the available space (with some padding)
        const maxWidth = Math.min(availableWidth * 0.98, baseWidth * 1.5);
        const maxHeight = Math.min(availableHeight * 0.98, baseHeight * 1.5);
        
        if (displayWidth > maxWidth) {
            displayWidth = maxWidth;
            displayHeight = displayWidth / aspectRatio;
        }
        
        if (displayHeight > maxHeight) {
            displayHeight = maxHeight;
            displayWidth = displayHeight * aspectRatio;
        }
        
        // Set canvas display size (CSS)
        this.canvas.style.width = Math.floor(displayWidth) + 'px';
        this.canvas.style.height = Math.floor(displayHeight) + 'px';
        
        // Keep internal resolution consistent for crisp rendering
        this.canvas.width = baseWidth;
        this.canvas.height = baseHeight;
        
        // Store scale factor for potential use
        this.canvasScale = {
            x: baseWidth / displayWidth,
            y: baseHeight / displayHeight,
            displayWidth: displayWidth,
            displayHeight: displayHeight
        };
        
        // Adjust game elements based on screen size
        this.adjustGameElements(displayWidth, displayHeight);
        
        console.log(`Canvas Display: ${Math.floor(displayWidth)}×${Math.floor(displayHeight)}px | Internal: ${baseWidth}×${baseHeight}px`);
    },
    
    adjustGameElements(displayWidth, displayHeight) {
        // Determine screen category
        const isDesktop = displayWidth >= 1024;
        const isTablet = displayWidth >= 768 && displayWidth < 1024;
        const isMobile = displayWidth < 768;
        
        // Adjust player size based on screen category
        if (isDesktop) {
            // Desktop - standard size
            this.player.radius = 30;
            this.fontSize = { hud: 40, menu: 60, gameOver: 60 };
            this.mobileMode = false;
        } else if (isTablet) {
            // Tablet - slightly smaller
            this.player.radius = 28;
            this.fontSize = { hud: 36, menu: 52, gameOver: 56 };
            this.mobileMode = false;
        } else if (displayWidth >= 480) {
            // Large mobile
            this.player.radius = 26;
            this.fontSize = { hud: 32, menu: 48, gameOver: 52 };
            this.mobileMode = true;
        } else {
            // Small mobile
            this.player.radius = 24;
            this.fontSize = { hud: 28, menu: 42, gameOver: 48 };
            this.mobileMode = true;
        }
        
        console.log(`Screen mode: ${isDesktop ? 'Desktop' : isTablet ? 'Tablet' : 'Mobile'} | Player radius: ${this.player.radius}px`);
    },
    
    handleResize() {
        // Clear any pending resize
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        
        // Debounce resize to prevent too many calls
        this.resizeTimeout = setTimeout(() => {
            this.setupResponsiveCanvas();
            
            // Force a render update
            if (this.state !== 'playing') {
                this.render();
            }
        }, 100);
    },
    
    handleInput() {
        if (this.state === 'menu') {
            this.startGame();
        } else if (this.state === 'playing') {
            this.cycleColor();
        } else if (this.state === 'gameOver') {
            this.startGame();
        }
    },
    
    startGame() {
        // Reset game state
        this.colorIndex = 0;
        this.gates = [];
        this.particles = [];
        this.speed = 3;
        this.score = 0;
        this.multiplier = 1;
        this.combo = 0;
        this.time = 0;
        this.lastGateTime = 0;
        
        this.state = 'playing';
        
        // Notify SDKs
        SDKManager.gameplayStart();
        
        // Start game loop
        if (!this.animationId) {
            this.gameLoop();
        }
        
        console.log('Game started!');
    },
    
    cycleColor() {
        this.colorIndex = (this.colorIndex + 1) % 3;
    },
    
    gameLoop() {
        if (this.state === 'playing') {
            this.update();
        }
        this.render();
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    },
    
    update() {
        this.time++;
        
        // Spawn gates
        if (this.time - this.lastGateTime > this.gateSpawnInterval) {
            this.spawnGate();
            this.lastGateTime = this.time;
            
            // Gradually decrease spawn interval (increase difficulty)
            if (this.gateSpawnInterval > 80) {
                this.gateSpawnInterval -= 0.5;
            }
        }
        
        // Update gates
        this.updateGates();
        
        // Update particles
        this.updateParticles();
        
        // Increase speed over time
        if (this.time % 600 === 0) {
            this.speed = Math.min(this.speed + 0.3, 8);
        }
    },
    
    spawnGate() {
        const randomColor = Math.floor(Math.random() * 3);
        const gateWidth = 120 + Math.random() * 80;
        const gateX = 400 - gateWidth / 2;
        
        this.gates.push({
            x: gateX,
            y: -100,
            width: gateWidth,
            height: 20,
            color: this.colors[randomColor],
            colorIndex: randomColor,
            passed: false
        });
    },
    
    updateGates() {
        for (let i = this.gates.length - 1; i >= 0; i--) {
            const gate = this.gates[i];
            gate.y += this.speed;
            
            // Collision detection
            if (!gate.passed && gate.y > this.player.y - 50 && gate.y < this.player.y + 50) {
                const playerLeft = this.player.x - this.player.radius;
                const playerRight = this.player.x + this.player.radius;
                const gateLeft = gate.x;
                const gateRight = gate.x + gate.width;
                
                // Check if player is within gate width
                if (playerLeft >= gateLeft && playerRight <= gateRight) {
                    // Check color match
                    if (gate.colorIndex === this.colorIndex) {
                        // SUCCESS!
                        gate.passed = true;
                        this.score += Math.floor(this.multiplier);
                        this.combo++;
                        
                        // Update multiplier
                        if (this.combo >= 10) this.multiplier = 2;
                        else if (this.combo >= 5) this.multiplier = 1.5;
                        
                        // Create particles
                        this.createParticles(gate.x + gate.width / 2, gate.y, gate.color, 15);
                    } else {
                        // GAME OVER - Wrong color!
                        this.endGame();
                    }
                } else if (gate.y > this.player.y) {
                    // Missed gate
                    this.endGame();
                }
            }
            
            // Remove off-screen gates
            if (gate.y > 700) {
                this.gates.splice(i, 1);
            }
        }
    },
    
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    },
    
    createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 2 + Math.random() * 3;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 60,
                color
            });
        }
    },
    
    endGame() {
        this.state = 'gameOver';
        
        // Save high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('chromaRushHighScore', this.highScore.toString());
        }
        
        // Notify SDKs
        SDKManager.gameplayStop();
        
        // Show midgame ad occasionally (20% chance)
        if (Math.random() < 0.2) {
            SDKManager.showMidgameAd();
        }
        
        console.log('Game Over! Score:', this.score);
    },
    
    showContinueOption() {
        // This would show a "Continue?" button with rewarded ad
        // For now, just log
        console.log('Continue option available');
    },
    
    render() {
        const ctx = this.ctx;
        
        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 800, 600);
        
        if (this.state === 'playing') {
            // Draw tunnel
            this.drawTunnel();
            
            // Draw gates
            this.drawGates();
            
            // Draw particles
            this.drawParticles();
            
            // Draw player
            this.drawPlayer();
            
            // Draw HUD
            this.drawHUD();
        } else if (this.state === 'menu') {
            this.drawMenu();
        } else if (this.state === 'gameOver') {
            this.drawGameOver();
        }
    },
    
    drawTunnel() {
        const ctx = this.ctx;
        ctx.strokeStyle = '#1A1A2E';
        ctx.lineWidth = 1;
        
        // Vertical lines
        for (let i = 0; i < 6; i++) {
            const x = 150 + i * 100;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(400, 600);
            ctx.stroke();
        }
        
        // Horizontal lines with animation
        for (let i = 0; i < 10; i++) {
            const y = i * 60;
            const offset = (this.time * this.speed * 0.5) % 60;
            ctx.beginPath();
            ctx.moveTo(150, y - offset);
            ctx.lineTo(650, y - offset);
            ctx.stroke();
        }
    },
    
    drawGates() {
        const ctx = this.ctx;
        
        for (const gate of this.gates) {
            // Glow effect
            ctx.fillStyle = gate.color + '40';
            ctx.fillRect(gate.x - 20, gate.y - 20, gate.width + 40, gate.height + 40);
            
            // Main gate
            ctx.fillStyle = gate.color;
            ctx.fillRect(gate.x, gate.y, gate.width, gate.height);
        }
    },
    
    drawParticles() {
        const ctx = this.ctx;
        
        for (const p of this.particles) {
            const alpha = Math.floor((p.life / 60) * 255).toString(16).padStart(2, '0');
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = p.color + alpha;
            ctx.fill();
        }
    },
    
    drawPlayer() {
        const ctx = this.ctx;
        const { x, y, radius } = this.player;
        const color = this.colors[this.colorIndex];
        
        // Outer glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
        gradient.addColorStop(0, color + '80');
        gradient.addColorStop(0.5, color + '40');
        gradient.addColorStop(1, color + '00');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius * 2, y - radius * 2, radius * 4, radius * 4);
        
        // Main orb
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        
        // Inner highlight
        ctx.beginPath();
        ctx.arc(x - 8, y - 8, radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
        
        // Pulsing ring
        const pulse = Math.sin(this.time * 0.1) * 5;
        ctx.beginPath();
        ctx.arc(x, y, radius + 10 + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
    },
    
    drawHUD() {
        const ctx = this.ctx;
        
        // Score
        ctx.font = `bold ${this.fontSize.hud}px Arial`;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 10;
        ctx.fillText(this.score, 20, 50);
        
        // Multiplier
        if (this.multiplier > 1) {
            ctx.font = `bold ${this.fontSize.hud * 0.75}px Arial`;
            ctx.fillStyle = '#FFE000';
            const multiplierX = this.mobileMode ? 750 : 720;
            ctx.fillText(`x${this.multiplier.toFixed(1)}`, multiplierX, 50);
        }
        
        // Current color
        ctx.font = `bold ${this.fontSize.hud * 0.5}px Arial`;
        ctx.fillStyle = this.colors[this.colorIndex];
        ctx.textAlign = 'center';
        ctx.fillText(this.colorNames[this.colorIndex], 400, 580);
        ctx.textAlign = 'left';
        
        ctx.shadowBlur = 0;
    },
    
    drawMenu() {
        const ctx = this.ctx;
        
        // Title
        ctx.font = `bold ${this.fontSize.menu}px Arial`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 20;
        ctx.fillText('TAP TO START', 400, 300);
        
        // Subtitle
        ctx.font = `${this.fontSize.menu * 0.35}px Arial`;
        ctx.fillStyle = '#AAAAAA';
        ctx.shadowBlur = 0;
        ctx.fillText('Match your color to the gates', 400, 340);
        
        // Mobile hint
        if (this.mobileMode) {
            ctx.font = `${this.fontSize.menu * 0.3}px Arial`;
            ctx.fillStyle = '#666';
            ctx.fillText('Tap anywhere to change color', 400, 380);
        }
        
        ctx.textAlign = 'left';
    },
    
    drawGameOver() {
        const ctx = this.ctx;
        
        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, 800, 600);
        
        // GAME OVER
        ctx.font = `bold ${this.fontSize.gameOver * 0.7}px Arial`;
        ctx.fillStyle = '#FF0040';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#FF0040';
        ctx.shadowBlur = 20;
        ctx.fillText('GAME OVER', 400, 200);
        
        // Score
        ctx.font = `bold ${this.fontSize.gameOver}px Arial`;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 10;
        ctx.fillText(this.score, 400, 280);
        
        // High score
        ctx.font = `${this.fontSize.gameOver * 0.4}px Arial`;
        ctx.fillStyle = '#AAAAAA';
        ctx.shadowBlur = 0;
        ctx.fillText('High Score: ' + this.highScore, 400, 320);
        
        // Tap to retry
        ctx.font = `bold ${this.fontSize.gameOver * 0.5}px Arial`;
        ctx.fillStyle = '#00F0FF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 15;
        const pulse = 0.7 + Math.sin(this.time * 0.1) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillText('TAP TO RETRY', 400, 400);
        ctx.globalAlpha = 1;
        
        ctx.textAlign = 'left';
        ctx.shadowBlur = 0;
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

// Wait for DOM to load
window.addEventListener('load', async () => {
    console.log('Chroma Rush Loading...');
    
    // Initialize SDK first
    const platform = await SDKManager.init();
    console.log('Platform:', platform);
    
    // Initialize game
    Game.init();
    
    // Update UI
    const subtitle = document.getElementById('subtitle');
    subtitle.innerHTML = 'Click or press SPACE to start';
    
    // Add instructions
    const instructionsContainer = document.getElementById('instructions');
    instructionsContainer.innerHTML = `
        <h3>How to Play</h3>
        <div class="instruction-grid">
            <div class="instruction-box" style="border-color: #FF0040; background: rgba(255, 0, 64, 0.1);">
                <h3 style="color: #FF0040;">1. CYCLE COLORS</h3>
                <p>Click or press SPACE to switch between Red → Blue → Yellow</p>
            </div>
            <div class="instruction-box" style="border-color: #00F0FF; background: rgba(0, 240, 255, 0.1);">
                <h3 style="color: #00F0FF;">2. MATCH GATES</h3>
                <p>Your color must match the gate color to pass through</p>
            </div>
            <div class="instruction-box" style="border-color: #FFE000; background: rgba(255, 224, 0, 0.1);">
                <h3 style="color: #FFE000;">3. BUILD COMBOS</h3>
                <p>Match 5+ gates for 1.5x multiplier, 10+ for 2x!</p>
            </div>
        </div>
    `;
    
    // Start render loop
    Game.gameLoop();
    
    console.log('✅ Chroma Rush Ready!');
    
    // Platform indicator
    if (platform !== 'standalone') {
        subtitle.textContent = `Playing on ${platform} - Click to start`;
    }
});

// Prevent context menu on canvas (mobile)
document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'CANVAS') {
        e.preventDefault();
    }
});

// Export for potential use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Game, SDKManager };
}
