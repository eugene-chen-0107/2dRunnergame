/* ==========================================================================
   STICKMAN RUNNER - ENGINE & GAME LOGIC
   ========================================================================== */

(() => {
  'use strict';

  // --- Canvas Setup & Scaling ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('game-overlay');
  const startScreen = document.getElementById('start-screen');
  const gameOverScreen = document.getElementById('game-over-screen');
  const finalScoreEl = document.getElementById('final-score');
  const finalHighScoreEl = document.getElementById('final-high-score');
  const restartBtn = document.getElementById('restart-btn');
  const soundBtn = document.getElementById('sound-btn');
  const soundIcon = document.getElementById('sound-icon');
  const themeBtn = document.getElementById('theme-btn');
  const themeIcon = document.getElementById('theme-icon');
  const touchJump = document.getElementById('touch-jump');
  const touchDuck = document.getElementById('touch-duck');

  // Internal logical dimensions
  const GAME_WIDTH = 900;
  const GAME_HEIGHT = 300;
  const GROUND_Y = 240;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(canvas.width / GAME_WIDTH, canvas.height / GAME_HEIGHT);
  }

  window.addEventListener('resize', resizeCanvas);

  // --- Sound Engine (Web Audio API) ---
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.enabled = localStorage.getItem('stickman_sound') !== 'off';
      this.updateIcon();
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem('stickman_sound', this.enabled ? 'on' : 'off');
      this.updateIcon();
      if (this.enabled) this.playJump();
    }

    updateIcon() {
      soundIcon.textContent = this.enabled ? '🔊' : '🔇';
    }

    playJump() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(520, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    }

    playDuck() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, this.ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    }

    playMilestone() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, index) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + index * 0.08);

        gain.gain.setValueAtTime(0.15, now + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.15);
      });
    }

    playHit() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    }
  }

  const sound = new SoundEngine();

  // --- Theme Manager ---
  let isDarkMode = true;
  function setTheme(dark) {
    isDarkMode = dark;
    document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    themeIcon.textContent = isDarkMode ? '🌙' : '☀️';
    localStorage.setItem('stickman_theme', isDarkMode ? 'dark' : 'light');
  }
  const savedTheme = localStorage.getItem('stickman_theme');
  setTheme(savedTheme !== 'light');

  themeBtn.addEventListener('click', () => setTheme(!isDarkMode));
  soundBtn.addEventListener('click', () => sound.toggle());

  // --- Game State Constants ---
  const STATE = {
    START: 'START',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER'
  };

  let gameState = STATE.START;
  let score = 0;
  let highScore = parseInt(localStorage.getItem('stickman_highscore') || '0', 10);
  let gameSpeed = 6.5;
  let distanceRan = 0;

  // Day/Night transition state (0 = full day, 1 = full night)
  let dayNightFactor = 0;
  let dayNightTarget = 0;

  // --- Particles System ---
  class Particle {
    constructor(x, y, vx, vy, size, color, life) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.size = size;
      this.color = color;
      this.life = life;
      this.maxLife = life;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life--;
    }

    draw(ctx) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  let particles = [];

  function addDustCloud(x, y, count = 5) {
    const color = isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(70, 70, 70, 0.6)';
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(
        x, y,
        (Math.random() - 0.5) * 3 - 2,
        (Math.random() - 0.5) * 1.5 - 0.5,
        Math.random() * 2.5 + 1.5,
        color,
        Math.floor(Math.random() * 15 + 10)
      ));
    }
  }

  function addCrashExplosion(x, y) {
    const colors = ['#f43f5e', '#38bdf8', '#fbbf24', '#ffffff'];
    for (let i = 0; i < 25; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      particles.push(new Particle(
        x, y,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.8) * 8,
        Math.random() * 4 + 2,
        color,
        Math.floor(Math.random() * 25 + 15)
      ));
    }
  }

  // --- Background Clouds & Stars ---
  const clouds = [
    { x: 200, y: 50, scale: 0.8, speed: 0.6 },
    { x: 550, y: 70, scale: 1.2, speed: 0.4 },
    { x: 800, y: 40, scale: 0.9, speed: 0.5 }
  ];

  const stars = Array.from({ length: 30 }, () => ({
    x: Math.random() * GAME_WIDTH,
    y: Math.random() * 140,
    radius: Math.random() * 1.5 + 0.5,
    alpha: Math.random()
  }));

  // --- Stickman Player Class ---
  class Stickman {
    constructor() {
      this.x = 90;
      this.y = GROUND_Y;
      this.vy = 0;
      this.gravity = 0.65;
      this.jumpForce = -13.5;
      this.isGrounded = true;
      this.isDucking = false;
      this.animCycle = 0;
      this.dead = false;

      // Heights & Hitboxes
      this.normalHeight = 55;
      this.duckHeight = 28;
      this.width = 24;
    }

    reset() {
      this.y = GROUND_Y;
      this.vy = 0;
      this.isGrounded = true;
      this.isDucking = false;
      this.animCycle = 0;
      this.dead = false;
    }

    jump() {
      if (this.isGrounded && !this.dead) {
        this.vy = this.jumpForce;
        this.isGrounded = false;
        sound.playJump();
        addDustCloud(this.x, this.y, 8);
      }
    }

    releaseJump() {
      // Variable jump height: cut upward velocity if released early
      if (this.vy < -5) {
        this.vy = -5;
      }
    }

    setDuck(ducking) {
      if (this.dead) return;
      if (ducking && !this.isDucking) {
        if (!this.isGrounded) {
          // Fast fall
          this.vy += 6;
        } else {
          sound.playDuck();
        }
      }
      this.isDucking = ducking;
    }

    update() {
      if (this.dead) return;

      // Physics
      this.vy += this.gravity;
      this.y += this.vy;

      if (this.y >= GROUND_Y) {
        if (!this.isGrounded) {
          addDustCloud(this.x, GROUND_Y, 6);
        }
        this.y = GROUND_Y;
        this.vy = 0;
        this.isGrounded = true;
      }

      // Animation frame cycle
      if (this.isGrounded) {
        this.animCycle += gameSpeed * 0.045;
        if (Math.random() < 0.25) {
          addDustCloud(this.x - 5, GROUND_Y, 1);
        }
      }
    }

    getHitbox() {
      const h = this.isDucking ? this.duckHeight : this.normalHeight;
      const w = this.isDucking ? 34 : this.width;
      return {
        x: this.x - w / 2 + 2,
        y: this.y - h + 2,
        width: w - 4,
        height: h - 4
      };
    }

    draw(ctx) {
      ctx.save();

      // Stroke style matches dark/light mode
      const strokeColor = isDarkMode ? '#f8fafc' : '#0f172a';
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const cycle = this.animCycle;
      const x = this.x;
      const y = this.y;

      if (this.dead) {
        // --- Death Animation (Fallen Stickman) ---
        ctx.beginPath();
        // Head
        ctx.arc(x + 15, y - 10, 8, 0, Math.PI * 2);
        ctx.stroke();

        // X Eyes
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 12, y - 13); ctx.lineTo(x + 18, y - 7);
        ctx.moveTo(x + 18, y - 13); ctx.lineTo(x + 12, y - 7);
        ctx.stroke();

        ctx.lineWidth = 3.5;
        // Torso lying down
        ctx.beginPath();
        ctx.moveTo(x - 15, y - 6); ctx.lineTo(x + 8, y - 6);
        // Arms
        ctx.moveTo(x - 5, y - 6); ctx.lineTo(x - 12, y - 18);
        ctx.moveTo(x + 2, y - 6); ctx.lineTo(x + 8, y - 16);
        // Legs
        ctx.moveTo(x - 15, y - 6); ctx.lineTo(x - 25, y - 2);
        ctx.moveTo(x - 15, y - 6); ctx.lineTo(x - 22, y - 12);
        ctx.stroke();

      } else if (this.isDucking && this.isGrounded) {
        // --- Ducking / Sliding Animation ---
        const headX = x + 12;
        const headY = y - 20;

        // Head
        ctx.beginPath();
        ctx.arc(headX, headY, 7, 0, Math.PI * 2);
        ctx.stroke();

        // Torso slanted low
        ctx.beginPath();
        ctx.moveTo(x - 12, y - 12);
        ctx.lineTo(headX - 6, headY + 3);
        ctx.stroke();

        // Legs horizontal/crouched
        const legSwing = Math.sin(cycle) * 5;
        ctx.beginPath();
        ctx.moveTo(x - 12, y - 12); ctx.lineTo(x - 22 + legSwing, y - 2);
        ctx.moveTo(x - 12, y - 12); ctx.lineTo(x - 6 - legSwing, y - 2);
        ctx.stroke();

        // Arms stretched back/forward
        ctx.beginPath();
        ctx.moveTo(x - 2, y - 14); ctx.lineTo(x - 16, y - 8);
        ctx.moveTo(x - 2, y - 14); ctx.lineTo(x + 8, y - 8);
        ctx.stroke();

      } else if (!this.isGrounded) {
        // --- Jumping Animation ---
        const headY = y - 48;

        // Head
        ctx.beginPath();
        ctx.arc(x, headY, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Torso
        const hipY = y - 22;
        ctx.beginPath();
        ctx.moveTo(x, headY + 8);
        ctx.lineTo(x, hipY);
        ctx.stroke();

        // Legs tucked up in jump
        ctx.beginPath();
        // Left leg
        ctx.moveTo(x, hipY); ctx.lineTo(x - 12, hipY + 10); ctx.lineTo(x - 6, hipY + 20);
        // Right leg
        ctx.moveTo(x, hipY); ctx.lineTo(x + 10, hipY + 8); ctx.lineTo(x + 14, hipY + 18);
        ctx.stroke();

        // Arms raised back/up
        ctx.beginPath();
        ctx.moveTo(x, headY + 14); ctx.lineTo(x - 14, headY + 5); ctx.lineTo(x - 20, headY - 5);
        ctx.moveTo(x, headY + 14); ctx.lineTo(x + 14, headY + 8);
        ctx.stroke();

      } else {
        // --- Normal Running Animation ---
        const headY = y - 46;
        const hipY = y - 20;

        // Leaning angle slight forward
        const lean = 3;

        // Head
        ctx.beginPath();
        ctx.arc(x + lean, headY, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Eye looking forward
        ctx.beginPath();
        ctx.arc(x + lean + 4, headY - 2, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Spine/Torso
        ctx.beginPath();
        ctx.moveTo(x + lean, headY + 8);
        ctx.lineTo(x, hipY);
        ctx.stroke();

        // Kinematic Legs swinging smoothly
        const legAngle = Math.sin(cycle) * 0.75;
        const kneeL = {
          x: x + Math.sin(legAngle) * 14,
          y: hipY + Math.cos(legAngle) * 12
        };
        const footL = {
          x: kneeL.x + Math.sin(legAngle - 0.4) * 12,
          y: Math.min(GROUND_Y, kneeL.y + Math.cos(legAngle - 0.4) * 10)
        };

        const kneeR = {
          x: x + Math.sin(-legAngle) * 14,
          y: hipY + Math.cos(-legAngle) * 12
        };
        const footR = {
          x: kneeR.x + Math.sin(-legAngle - 0.4) * 12,
          y: Math.min(GROUND_Y, kneeR.y + Math.cos(-legAngle - 0.4) * 10)
        };

        // Draw Left Leg
        ctx.beginPath();
        ctx.moveTo(x, hipY);
        ctx.lineTo(kneeL.x, kneeL.y);
        ctx.lineTo(footL.x, footL.y);
        ctx.stroke();

        // Draw Right Leg
        ctx.beginPath();
        ctx.moveTo(x, hipY);
        ctx.lineTo(kneeR.x, kneeR.y);
        ctx.lineTo(footR.x, footR.y);
        ctx.stroke();

        // Kinematic Arms swinging opposite to legs
        const armAngle = -legAngle;
        const shoulderY = headY + 12;

        ctx.beginPath();
        // Left arm
        ctx.moveTo(x + lean, shoulderY);
        ctx.lineTo(x + lean + Math.sin(armAngle) * 12, shoulderY + Math.cos(armAngle) * 10);
        // Right arm
        ctx.moveTo(x + lean, shoulderY);
        ctx.lineTo(x + lean + Math.sin(-armAngle) * 12, shoulderY + Math.cos(-armAngle) * 10);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // --- Obstacle Classes ---
  class Obstacle {
    constructor(type, x) {
      this.type = type; // 'cactus_small', 'cactus_large', 'hurdle', 'bird'
      this.x = x;
      this.markedForDeletion = false;

      if (type === 'cactus_small') {
        this.width = 24;
        this.height = 42;
        this.y = GROUND_Y - this.height;
      } else if (type === 'cactus_large') {
        this.width = 42;
        this.height = 54;
        this.y = GROUND_Y - this.height;
      } else if (type === 'hurdle') {
        this.width = 32;
        this.height = 36;
        this.y = GROUND_Y - this.height;
      } else if (type === 'bird') {
        this.width = 38;
        this.height = 26;
        // Flying altitude: 0 = low (jump), 1 = medium (duck or jump), 2 = high (duck)
        const heights = [GROUND_Y - 40, GROUND_Y - 62, GROUND_Y - 85];
        this.altitudeIndex = Math.floor(Math.random() * (score > 400 ? 3 : 2));
        this.y = heights[this.altitudeIndex];
        this.wingFrame = 0;
      }
    }

    update() {
      this.x -= gameSpeed;
      if (this.x + this.width < -20) {
        this.markedForDeletion = true;
      }
      if (this.type === 'bird') {
        this.wingFrame += 0.15;
      }
    }

    getHitbox() {
      return {
        x: this.x + 3,
        y: this.y + 3,
        width: this.width - 6,
        height: this.height - 6
      };
    }

    draw(ctx) {
      ctx.save();
      const strokeColor = isDarkMode ? '#f8fafc' : '#0f172a';
      const fillColor = isDarkMode ? '#1e293b' : '#e2e8f0';
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (this.type === 'cactus_small') {
        // Draw single cactus
        ctx.beginPath();
        // Main stem
        ctx.rect(this.x + 8, this.y, 8, this.height);
        // Left arm
        ctx.moveTo(this.x + 8, this.y + 18);
        ctx.lineTo(this.x + 2, this.y + 18);
        ctx.lineTo(this.x + 2, this.y + 8);
        // Right arm
        ctx.moveTo(this.x + 16, this.y + 24);
        ctx.lineTo(this.x + 22, this.y + 24);
        ctx.lineTo(this.x + 22, this.y + 14);
        ctx.stroke();

      } else if (this.type === 'cactus_large') {
        // Draw double cactus cluster
        ctx.beginPath();
        // Stem 1
        ctx.rect(this.x + 6, this.y, 10, this.height);
        // Stem 2
        ctx.rect(this.x + 24, this.y + 10, 10, this.height - 10);
        // Arms
        ctx.moveTo(this.x + 6, this.y + 22); ctx.lineTo(this.x, this.y + 22); ctx.lineTo(this.x, this.y + 12);
        ctx.moveTo(this.x + 34, this.y + 28); ctx.lineTo(this.x + 40, this.y + 28); ctx.lineTo(this.x + 40, this.y + 18);
        ctx.stroke();

      } else if (this.type === 'hurdle') {
        // Draw Track & Field Barrier / Hurdle
        ctx.beginPath();
        // Legs
        ctx.moveTo(this.x + 4, this.y + this.height); ctx.lineTo(this.x + 8, this.y);
        ctx.moveTo(this.x + this.width - 4, this.y + this.height); ctx.lineTo(this.x + this.width - 8, this.y);
        // Crossbar
        ctx.rect(this.x + 2, this.y + 4, this.width - 4, 10);
        ctx.fill();
        ctx.stroke();

      } else if (this.type === 'bird') {
        // Draw Pterodactyl / Bird with flapping wings
        const wingY = Math.sin(this.wingFrame) * 12;

        ctx.beginPath();
        // Head & Beak
        ctx.moveTo(this.x + 8, this.y + 12);
        ctx.lineTo(this.x, this.y + 10);
        ctx.lineTo(this.x + 10, this.y + 16);
        // Body
        ctx.lineTo(this.x + 30, this.y + 14);
        ctx.lineTo(this.x + 38, this.y + 8); // Tail
        ctx.stroke();

        // Wings
        ctx.beginPath();
        ctx.moveTo(this.x + 18, this.y + 13);
        ctx.lineTo(this.x + 12, this.y + 13 - wingY);
        ctx.lineTo(this.x + 26, this.y + 13);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // Instantiated Objects
  const player = new Stickman();
  let obstacles = [];
  let obstacleTimer = 0;
  let nextObstacleGap = 90;

  // --- Collision Detection AABB ---
  function checkCollision(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  // --- Input Handlers ---
  const keys = {};

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (gameState === STATE.START || gameState === STATE.GAMEOVER) {
        startGame();
      } else if (gameState === STATE.PLAYING) {
        player.jump();
      }
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      if (gameState === STATE.PLAYING) {
        player.setDuck(true);
      }
    } else if (e.code === 'KeyP') {
      togglePause();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      player.releaseJump();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      player.setDuck(false);
    }
  });

  // Touch controls
  if (touchJump) {
    touchJump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (gameState === STATE.START || gameState === STATE.GAMEOVER) startGame();
      else if (gameState === STATE.PLAYING) player.jump();
    });
    touchJump.addEventListener('touchend', (e) => {
      e.preventDefault();
      player.releaseJump();
    });
  }

  if (touchDuck) {
    touchDuck.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (gameState === STATE.PLAYING) player.setDuck(true);
    });
    touchDuck.addEventListener('touchend', (e) => {
      e.preventDefault();
      player.setDuck(false);
    });
  }

  // Canvas click to jump/start
  canvas.addEventListener('click', () => {
    if (gameState === STATE.START || gameState === STATE.GAMEOVER) {
      startGame();
    } else if (gameState === STATE.PLAYING) {
      player.jump();
    }
  });

  restartBtn.addEventListener('click', () => {
    startGame();
  });

  // --- Game Flow Methods ---
  function startGame() {
    sound.init();
    gameState = STATE.PLAYING;
    score = 0;
    distanceRan = 0;
    gameSpeed = 6.5;
    obstacles = [];
    particles = [];
    obstacleTimer = 0;
    nextObstacleGap = 80;
    player.reset();

    overlay.classList.add('hidden');
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
  }

  function togglePause() {
    if (gameState === STATE.PLAYING) {
      gameState = STATE.PAUSED;
    } else if (gameState === STATE.PAUSED) {
      gameState = STATE.PLAYING;
    }
  }

  function gameOver() {
    gameState = STATE.GAMEOVER;
    player.dead = true;
    sound.playHit();
    addCrashExplosion(player.x, player.y - 25);

    if (score > highScore) {
      highScore = score;
      localStorage.setItem('stickman_highscore', highScore.toString());
    }

    finalScoreEl.textContent = score.toString().padStart(5, '0');
    finalHighScoreEl.textContent = highScore.toString().padStart(5, '0');

    setTimeout(() => {
      overlay.classList.remove('hidden');
      startScreen.classList.add('hidden');
      gameOverScreen.classList.remove('hidden');
    }, 400);
  }

  // --- Obstacle Spawner ---
  function spawnObstacles() {
    obstacleTimer++;
    if (obstacleTimer >= nextObstacleGap) {
      obstacleTimer = 0;

      // Calculate gap based on current speed
      const minGap = Math.max(45, 95 - gameSpeed * 2.5);
      nextObstacleGap = minGap + Math.random() * 45;

      const types = ['cactus_small', 'cactus_large', 'hurdle'];
      if (score > 120) types.push('bird');

      const selectedType = types[Math.floor(Math.random() * types.length)];
      obstacles.push(new Obstacle(selectedType, GAME_WIDTH + 20));
    }
  }

  // --- Drawing Environment ---
  let groundOffset = 0;

  function drawBackground() {
    // Smooth Day / Night cycle logic
    const cyclePeriod = 700;
    const stage = Math.floor(score / cyclePeriod) % 2;
    dayNightTarget = stage === 1 ? 1 : 0;
    dayNightFactor += (dayNightTarget - dayNightFactor) * 0.02;

    // Sky colors
    const dayBg = isDarkMode ? '#0f172a' : '#f8fafc';
    const nightBg = '#020617';

    // Clear canvas
    ctx.fillStyle = dayBg;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    if (dayNightFactor > 0.01) {
      ctx.save();
      ctx.globalAlpha = dayNightFactor;
      ctx.fillStyle = nightBg;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Draw Stars
      ctx.fillStyle = '#ffffff';
      stars.forEach(star => {
        ctx.globalAlpha = dayNightFactor * (0.3 + 0.7 * Math.sin(Date.now() * 0.003 + star.x));
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Moon
      ctx.globalAlpha = dayNightFactor * 0.9;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(780, 50, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw Clouds
    ctx.save();
    const cloudColor = isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
    ctx.fillStyle = cloudColor;
    clouds.forEach(cloud => {
      if (gameState === STATE.PLAYING) {
        cloud.x -= cloud.speed;
        if (cloud.x < -100) cloud.x = GAME_WIDTH + 50;
      }
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, 16 * cloud.scale, 0, Math.PI * 2);
      ctx.arc(cloud.x + 15 * cloud.scale, cloud.y - 8 * cloud.scale, 18 * cloud.scale, 0, Math.PI * 2);
      ctx.arc(cloud.x + 32 * cloud.scale, cloud.y, 14 * cloud.scale, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Draw Ground Line & Texture
    ctx.save();
    const lineColor = isDarkMode ? '#475569' : '#94a3b8';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(GAME_WIDTH, GROUND_Y);
    ctx.stroke();

    // Scrolling ground dots/pebbles
    if (gameState === STATE.PLAYING) {
      groundOffset = (groundOffset + gameSpeed) % 40;
    }
    ctx.fillStyle = lineColor;
    for (let x = -groundOffset; x < GAME_WIDTH; x += 40) {
      ctx.fillRect(x + 5, GROUND_Y + 6, 8, 2);
      ctx.fillRect(x + 22, GROUND_Y + 12, 4, 2);
      ctx.fillRect(x + 35, GROUND_Y + 4, 12, 2);
    }
    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    const textColor = isDarkMode ? '#f8fafc' : '#0f172a';
    ctx.fillStyle = textColor;
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'right';

    const currentStr = score.toString().padStart(5, '0');
    const highStr = highScore.toString().padStart(5, '0');

    ctx.fillText(`HI ${highStr}  ${currentStr}`, GAME_WIDTH - 25, 35);
    ctx.restore();
  }

  // --- Main Game Loop ---
  let lastTime = performance.now();

  function gameLoop(now) {
    const dt = now - lastTime;
    lastTime = now;

    // Clear & render background
    drawBackground();

    if (gameState === STATE.PLAYING) {
      // Update Speed & Score
      distanceRan += gameSpeed * 0.08;
      const prevScore = score;
      score = Math.floor(distanceRan);

      // Milestone audio feedback
      if (score > 0 && score % 100 === 0 && score !== prevScore) {
        sound.playMilestone();
      }

      // Smooth difficulty acceleration
      if (gameSpeed < 16) {
        gameSpeed += 0.0012;
      }

      // Update Player
      player.update();

      // Update Particles
      particles.forEach(p => p.update());
      particles = particles.filter(p => p.life > 0);

      // Update & Spawn Obstacles
      spawnObstacles();
      obstacles.forEach(obs => {
        obs.update();

        // Check Collision with player
        if (checkCollision(player.getHitbox(), obs.getHitbox())) {
          gameOver();
        }
      });
      obstacles = obstacles.filter(obs => !obs.markedForDeletion);
    }

    // Render Particles
    particles.forEach(p => p.draw(ctx));

    // Render Obstacles
    obstacles.forEach(obs => obs.draw(ctx));

    // Render Player
    player.draw(ctx);

    // Render HUD
    drawHUD();

    requestAnimationFrame(gameLoop);
  }

  // Initialize Canvas dimensions and start loop
  resizeCanvas();
  requestAnimationFrame(gameLoop);

})();
