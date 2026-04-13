/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  NEURAL BASKET v4.0                                        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  FLOW:                                                     ║
 * ║  1. Enter name → click START                               ║
 * ║  2. Tutorial screen: shows how to hold hand                 ║
 * ║  3. System detects hand → 3-2-1 countdown → game starts    ║
 * ║  4. 5 waves × 20 balls = 100 balls per student             ║
 * ║  5. Virtual basket follows hand, catches falling balls      ║
 * ║  6. HAND LEAVES CAMERA = INSTANT OUT (no grace period)      ║
 * ║  7. After 100 balls or OUT → score saved, next student      ║
 * ║  8. "End Tournament" → champion announced                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ───── DOM ─────
const videoEl          = document.getElementById('input-video');
const canvas           = document.getElementById('game-canvas');
const ctx              = canvas.getContext('2d');

const scoreDisplay     = document.getElementById('score-display');
const waveDisplay      = document.getElementById('wave-display');
const handStatusEl     = document.getElementById('hand-status');
const handChip         = document.getElementById('hand-chip');

const hudPlayer        = document.getElementById('hud-player');
const hudBalls         = document.getElementById('hud-balls');
const hudLink          = document.getElementById('hud-link');
const hudLive          = document.getElementById('hud-live');

const welcomeOverlay   = document.getElementById('welcome-overlay');
const calibrateOverlay = document.getElementById('calibrate-overlay');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber  = document.getElementById('countdown-number');
const turnEndOverlay   = document.getElementById('turn-end-overlay');
const turnEndBox       = document.getElementById('turn-end-box');
const resultsOverlay   = document.getElementById('results-overlay');
const winnerAnnounce   = document.getElementById('winner-announce');
const finalLeaderboard = document.getElementById('final-leaderboard');
const loadingOverlay   = document.getElementById('loading-overlay');
const detectStatus     = document.getElementById('detect-status');
const handVisual       = document.getElementById('hand-visual');
const waveAnnounce     = document.getElementById('wave-announce');
const waveAnnounceText = document.getElementById('wave-announce-text');

const btnStart         = document.getElementById('btn-start');
const btnEndGame       = document.getElementById('btn-end-game');
const nameInput        = document.getElementById('player-name');

const catchRateBar     = document.getElementById('catch-rate-bar');
const statMissed       = document.getElementById('stat-missed');
const statLive         = document.getElementById('stat-live');
const lbContainer      = document.getElementById('leaderboard-container');

// Tutorial DOM
const tutorialVideoOverlay = document.getElementById('tutorial-video-overlay');
const tutorialTasksOverlay = document.getElementById('tutorial-tasks-overlay');
const gameSelectOverlay    = document.getElementById('game-select-overlay');

// ───── CONFIG ─────
const MAX_WAVES      = 5;
const BALLS_PER_WAVE = 20;
const TOTAL_BALLS    = MAX_WAVES * BALLS_PER_WAVE;
const WAVE_INTERVAL  = 10000;
let baseGravity      = 0.18;
let currentGravity   = 0.18;
const BALL_MIN_R     = 10;
const BALL_MAX_R     = 16;
const BASKET_W       = 160;
const BASKET_H       = 90;
const BASKET_BOT_W   = 120;

const BALL_PALETTE = [
    '#FF3B5C', '#FF6B35', '#FFC145', '#FFE66D', '#88D498',
    '#1DD3B0', '#00C9FF', '#5C7AEA', '#A855F7', '#EC4899',
    '#F43F5E', '#FB923C', '#FACC15', '#4ADE80', '#2DD4BF',
    '#38BDF8', '#818CF8', '#C084FC', '#F472B6', '#FF6B6B'
];

// ───── STATE ─────
// States: loading → welcome → calibrating → countdown → playing → turnEnd → welcome (loop) → results
let gameState    = 'loading';
let cameraReady  = false;
let worldW = 1280, worldH = 720;

let playerName     = '';
let score          = 0;
let missed         = 0;
let waveNum        = 0;
let totalResolved  = 0;
let balls          = [];
let catchFX        = [];
let scorePops      = [];
let spawnTimerId   = null;

// Basket
let basket       = { x: 640, y: 500 };
let basketTarget = { x: 640, y: 500 };

// Hand
let currentLandmarks = null;
let handVisible      = false;
let handWasVisible   = false; // tracks if hand was EVER visible during this play session

// Leaderboard
let leaderboard = JSON.parse(localStorage.getItem('neural_basket_lb') || '[]');

// Tutorial State
let tutorialCompleted = sessionStorage.getItem('neural_basket_tutorial_done') === 'true';
let tutVideoWatched = false;
let tutCompletedTasks = new Set();

// Game Selection
let selectedGame = null; // 'basket' or 'archery'
let currentLBView = 'basket'; // 'basket' or 'archery'

// Group / Multiplayer State
let playMode = 'solo'; // 'solo' or 'group'
let groupPlayers = [];
let currentPlayerIndex = 0;
let groupSessionResults = []; // Store scores for current group session


// ════════════════════════════════════════
//              BALL CREATION
// ════════════════════════════════════════

function createBall(index) {
    const r = BALL_MIN_R + Math.random() * (BALL_MAX_R - BALL_MIN_R);
    let type = 'normal';
    
    // Advanced: Special balls in later waves
    if (waveNum >= 3) {
        const rng = Math.random();
        if (rng < 0.1) type = 'bomb';
        else if (rng < 0.2 && waveNum >= 4) type = 'speed';
    }

    return {
        x: 50 + Math.random() * (worldW - 100),
        y: -r - Math.random() * 350,
        vx: (Math.random() - 0.5) * 2.5,
        vy: type === 'speed' ? 3 + Math.random() * 2 : 0.5 + Math.random() * 1.5,
        r, color: type === 'bomb' ? '#ff0055' : (type === 'speed' ? '#00bdff' : BALL_PALETTE[index % BALL_PALETTE.length]),
        type,
        alive: true, trail: []
    };
}

function spawnWave() {
    if (gameState !== 'playing') return;
    if (waveNum >= MAX_WAVES) return;

    waveNum++;
    
    // Adaptive Gravity
    currentGravity = baseGravity + (waveNum - 1) * 0.04;
    
    waveAnnounceText.textContent = `WAVE ${waveNum}`;
    if (waveNum === 3) waveAnnounceText.textContent = "WAVE 3: BOMBS ADDED 💣";
    if (waveNum === 5) waveAnnounceText.textContent = "WAVE 5: LIGHTNING SPEED ⚡";
    
    waveAnnounce.classList.add('show');
    setTimeout(() => waveAnnounce.classList.remove('show'), 2000);

    for (let i = 0; i < BALLS_PER_WAVE; i++) {
        balls.push(createBall(i));
    }
    updateHUD();

    if (waveNum < MAX_WAVES) {
        spawnTimerId = setTimeout(spawnWave, WAVE_INTERVAL);
    }
}


// ════════════════════════════════════════
//              PHYSICS
// ════════════════════════════════════════

function updatePhysics() {
    // Smooth basket
    basket.x += (basketTarget.x - basket.x) * 0.45;
    basket.y += (basketTarget.y - basket.y) * 0.45;
    basket.x = Math.max(BASKET_W / 2 + 10, Math.min(worldW - BASKET_W / 2 - 10, basket.x));
    basket.y = Math.max(BASKET_H + 30, Math.min(worldH - 20, basket.y));

    const bk = getBasketGeo();

    for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (!b.alive) continue;

        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 5) b.trail.shift();

        b.vy += currentGravity;
        b.x += b.vx;
        b.y += b.vy;

        // Screen walls
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.5; }
        if (b.x + b.r > worldW) { b.x = worldW - b.r; b.vx = -Math.abs(b.vx) * 0.5; }

        // Basket interaction
        const inH = b.x > bk.ltx && b.x < bk.rtx;
        const belowOpen = b.y + b.r > bk.ty;
        const aboveBot = b.y - b.r < bk.by;

        if (inH && belowOpen && aboveBot) {
            if (b.y + b.r >= bk.by - 5) {
                // CAUGHT!
                catchBall(b, i);
                continue;
            }
        }

        // Wall collisions
        wallCollide(b, bk.ltx, bk.ty, bk.lbx, bk.by);
        wallCollide(b, bk.rtx, bk.ty, bk.rbx, bk.by);

        // Missed (fell off bottom)
        if (b.y - b.r > worldH + 60) {
            b.alive = false;
            missed++;
            totalResolved++;
            balls.splice(i, 1);
            checkTurnEnd();
        }
    }

    // Particles
    for (let i = catchFX.length - 1; i >= 0; i--) {
        const p = catchFX[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.035;
        if (p.life <= 0) catchFX.splice(i, 1);
    }
    for (let i = scorePops.length - 1; i >= 0; i--) {
        const p = scorePops[i];
        p.y -= 1.5; p.life -= 0.025;
        if (p.life <= 0) scorePops.splice(i, 1);
    }
}

function getBasketGeo() {
    const hwt = BASKET_W / 2, hwb = BASKET_BOT_W / 2;
    return {
        ty: basket.y - BASKET_H, by: basket.y,
        ltx: basket.x - hwt, rtx: basket.x + hwt,
        lbx: basket.x - hwb, rbx: basket.x + hwb
    };
}

function wallCollide(ball, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = -dy / len, ny = dx / len;
    const dist = (ball.x - x1) * nx + (ball.y - y1) * ny;
    if (Math.abs(dist) < ball.r + 6) {
        const t = ((ball.y - y1) * dy + (ball.x - x1) * dx) / (len * len);
        if (t >= -0.1 && t <= 1.1) {
            const dir = dist < 0 ? -1 : 1;
            ball.x += nx * (ball.r + 6 - Math.abs(dist)) * dir;
            ball.y += ny * (ball.r + 6 - Math.abs(dist)) * dir;
            const vd = ball.vx * nx + ball.vy * ny;
            ball.vx -= 1.5 * vd * nx;
            ball.vy -= 1.5 * vd * ny;
            ball.vx *= 0.6;
            ball.vy *= 0.6;
        }
    }
}

function catchBall(ball, idx) {
    ball.alive = false;
    
    if (ball.type === 'bomb') {
        score = Math.max(0, score - 5);
        screenShake();
        // Bomb explosion effect
        for (let j = 0; j < 20; j++) {
            const a = (Math.PI * 2 / 20) * j;
            catchFX.push({ x: ball.x, y: ball.y, vx: Math.cos(a) * (5 + Math.random() * 5), vy: Math.sin(a) * (5 + Math.random() * 5), life: 1, color: '#ff0055' });
        }
    } else {
        score += (ball.type === 'speed' ? 2 : 1);
        for (let j = 0; j < 10; j++) {
            const a = (Math.PI * 2 / 10) * j;
            catchFX.push({ x: ball.x, y: ball.y, vx: Math.cos(a) * (2 + Math.random() * 3), vy: Math.sin(a) * (2 + Math.random() * 2), life: 1, color: ball.color });
        }
        scorePops.push({ x: ball.x, y: ball.y, life: 1, text: (ball.type === 'speed' ? '+2' : '+1') });
    }
    
    totalResolved++;
    balls.splice(idx, 1);
    updateHUD();
    checkTurnEnd();
}

function checkTurnEnd() {
    if (totalResolved >= TOTAL_BALLS && gameState === 'playing') {
        endTurn(false);
    }
}


// ════════════════════════════════════════
//         HAND DETECTION
// ════════════════════════════════════════

function processHand(results) {
    const detected = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    handVisible = detected;

    if (detected) {
        currentLandmarks = results.multiHandLandmarks[0];
        const w = currentLandmarks[0], im = currentLandmarks[5], pm = currentLandmarks[17];
        basketTarget.x = (w.x + im.x + pm.x) / 3 * worldW;
        basketTarget.y = (w.y + im.y + pm.y) / 3 * worldH;
    } else {
        currentLandmarks = null;
    }

    // HUD
    hudLink.textContent = detected ? 'HAND_LINK: ACTIVE' : 'HAND_LINK: OFFLINE';
    handStatusEl.textContent = detected ? 'OK' : 'LOST';
    handChip.className = 'stat-chip glass-morphism' + (detected ? ' safe' : ' lost');

    // ─── STATE-SPECIFIC LOGIC ───

    // ARCHERY: forward hand data to archery engine
    if (gameState === 'archeryPlaying' || gameState === 'archeryCal') {
        if (typeof archeryProcessHands === 'function') {
            archeryProcessHands(results);
        }
        return; // Archery handles its own hand logic
    }

    // CALIBRATING: waiting for hand to appear
    if (gameState === 'calibrating') {
        if (detected) {
            handVisual.classList.add('detected');
            detectStatus.classList.add('found');
            detectStatus.querySelector('.detect-searching span').textContent = 'HAND LOCKED! STARTING...';
            // Start countdown after a small delay to confirm stability
            setTimeout(() => {
                if (gameState === 'calibrating' && handVisible) {
                    startCountdown();
                }
            }, 800);
        } else {
            handVisual.classList.remove('detected');
            detectStatus.classList.remove('found');
            detectStatus.querySelector('.detect-searching span').textContent = 'SEARCHING FOR HAND...';
        }
    }

    // COUNTDOWN: if hand lost during countdown, go back to calibrating
    if (gameState === 'countdown' && !detected) {
        cancelCountdown();
    }

    // PLAYING: hand lost = INSTANT OUT
    if (gameState === 'playing') {
        if (!detected) {
            endTurn(true); // IMMEDIATE - no grace period
        }
    }
}


// ════════════════════════════════════════
//            GAME FLOW
// ════════════════════════════════════════

// Step 1: Welcome → enter name → click START
function goToCalibration() {
    const name = nameInput.value.trim();
    if (!name || !cameraReady) return;

    playerName = name;
    hudPlayer.textContent = `PLAYER: ${playerName.toUpperCase()}`;

    hideOverlay(welcomeOverlay);

    // Show game selection screen
    showGameSelect();
}

function showGameSelect() {
    gameState = 'gameSelect';
    showOverlay(gameSelectOverlay);
}

function selectGame(game) {
    selectedGame = game;
    hideOverlay(gameSelectOverlay);
    showTutorialAcademy(game);
}

function showTutorialAcademy(game) {
    const academy = document.getElementById('tutorial-academy-overlay');
    const title = document.getElementById('tut-academy-title');
    const steps = document.getElementById('tut-academy-steps');
    const visual = document.getElementById('tut-visual-container');

    if (game === 'basket') {
        title.innerHTML = 'NEURAL <span class="accent">BASKET</span> TRAINING';
        steps.innerHTML = `
            <div class="academy-step active"><div class="step-num">1</div><div class="step-txt">Show your hand clearly to the camera once calibration starts.</div></div>
            <div class="academy-step"><div class="step-num">2</div><div class="step-txt">Control the green basket by moving your hand horizontally.</div></div>
            <div class="academy-step"><div class="step-num">3</div><div class="step-txt">Catch the falling balls! Avoid <strong style="color:#ff3366">RED BOMBS (-5pts)</strong>.</div></div>
            <div class="academy-step"><div class="step-num">4</div><div class="step-txt">Blue speed balls are worth <strong>DOUBLE POINTS (+2pts)</strong>.</div></div>
        `;
        visual.innerHTML = '<div class="placeholder-icon">🏀</div>';
    } else {
        title.innerHTML = 'SHARP <span class="accent">SHOOTER</span> TRAINING';
        steps.innerHTML = `
            <div class="academy-step active"><div class="step-num">1</div><div class="step-txt">Show BOTH hands. One for the bow, one for the string.</div></div>
            <div class="academy-step"><div class="step-num">2</div><div class="step-txt">Pull your drawing hand back to tension the bow.</div></div>
            <div class="academy-step"><div class="step-num">3</div><div class="step-txt">Stay steady! Shaky hands make your aim wobble.</div></div>
            <div class="academy-step"><div class="step-num">4</div><div class="step-txt">Release the string quickly to fire. Watch the wind!</div></div>
        `;
        visual.innerHTML = '<div class="placeholder-icon">🏹</div>';
    }

    showOverlay(academy);
    
    // Animate steps
    const stepEls = steps.querySelectorAll('.academy-step');
    stepEls.forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        setTimeout(() => {
            el.style.transition = 'all 0.4s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateX(0)';
            if (i > 0) stepEls[i-1].classList.remove('active');
            el.classList.add('active');
        }, 1000 + i * 1500);
    });
}

document.getElementById('btn-tutorial-ready').onclick = () => {
    hideOverlay(document.getElementById('tutorial-academy-overlay'));
    proceedToCalibration();
};

function proceedToCalibration() {
    if (selectedGame === 'archery') {
        startArcheryCalibration();
    } else {
        showOverlay(calibrateOverlay);
        gameState = 'calibrating';
        handVisual.classList.remove('detected');
        detectStatus.classList.remove('found');
        detectStatus.querySelector('.detect-searching span').textContent = 'SEARCHING FOR HAND...';
    }
}

// Step 2: Hand detected → 3-2-1 countdown
let countdownTimerId = null;

function startCountdown() {
    gameState = 'countdown';
    hideOverlay(calibrateOverlay);
    showOverlay(countdownOverlay);

    let count = 3;
    countdownNumber.textContent = count;
    countdownNumber.className = 'countdown-number';

    countdownTimerId = setInterval(() => {
        count--;

        if (!handVisible) {
            // Hand lost during countdown — abort
            cancelCountdown();
            return;
        }

        if (count > 0) {
            countdownNumber.textContent = count;
            countdownNumber.className = 'countdown-number';
            // Re-trigger animation
            countdownNumber.style.animation = 'none';
            void countdownNumber.offsetHeight;
            countdownNumber.style.animation = '';
        } else if (count === 0) {
            countdownNumber.textContent = 'GO!';
            countdownNumber.className = 'countdown-number go';
            countdownNumber.style.animation = 'none';
            void countdownNumber.offsetHeight;
            countdownNumber.style.animation = '';
        } else {
            clearInterval(countdownTimerId);
            countdownTimerId = null;
            hideOverlay(countdownOverlay);
            beginPlaying();
        }
    }, 800);
}

function cancelCountdown() {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
    gameState = 'calibrating';
    hideOverlay(countdownOverlay);
    showOverlay(calibrateOverlay);

    handVisual.classList.remove('detected');
    detectStatus.classList.remove('found');
    detectStatus.querySelector('.detect-searching span').textContent = 'HAND LOST — SHOW YOUR HAND AGAIN';
}

// Step 3: Game begins
function beginPlaying() {
    score = 0;
    missed = 0;
    waveNum = 0;
    totalResolved = 0;
    balls = [];
    catchFX = [];
    scorePops = [];
    handWasVisible = true;

    gameState = 'playing';

    btnEndGame.style.display = 'flex';
    updateHUD();

    // First wave
    spawnWave();
}

// Step 4: Turn ends (complete or OUT)
function endTurn(wasOut) {
    gameState = 'turnEnd';
    clearTimeout(spawnTimerId);
    clearInterval(countdownTimerId);

    // Save score
    leaderboard.push({ name: playerName, score, date: new Date().toISOString() });
    leaderboard.sort((a, b) => b.score - a.score);
    localStorage.setItem('neural_basket_lb', JSON.stringify(leaderboard));
    
    // Store in session results
    groupSessionResults.push({ name: playerName, score });

    currentLBView = 'basket';
    updateLBTabs();
    renderSidebarLB();

    handleNextTurn();
}

function handleNextTurn() {
    if (playMode === 'group' && currentPlayerIndex < groupPlayers.length - 1) {
        currentPlayerIndex++;
        playerName = groupPlayers[currentPlayerIndex];
        
        // Show interim screen
        const interim = document.createElement('div');
        interim.className = 'full-overlay interim-overlay';
        interim.style.background = 'rgba(0,0,0,0.95)';
        interim.innerHTML = `
            <div class="overlay-box">
                <p style="color:var(--primary); font-family:var(--font-mono)">SESSION IN PROGRESS</p>
                <h2 style="font-size:2.5rem">${groupPlayers[currentPlayerIndex-1]} FINISHED!</h2>
                <div style="margin:2rem 0; padding:1.5rem; border:1px solid var(--glass-border); border-radius:16px;">
                    <p style="margin-bottom:0.5rem">NEXT PLAYER UP</p>
                    <h3 style="color:var(--secondary); font-size:2rem; letter-spacing:4px;">${playerName.toUpperCase()}</h3>
                </div>
                <button class="cyber-btn primary-c" onclick="this.parentElement.parentElement.remove(); startCalibration();">
                    <span>I'M READY</span>
                </button>
            </div>
        `;
        document.body.appendChild(interim);
        hideOverlay(endOverlay);
    } else {
        if (playMode === 'group') {
            showGroupTournamentResults();
        } else {
            showOverlay(endOverlay);
        }
    }
}

function showGroupTournamentResults() {
    hideOverlay(endOverlay);
    const results = document.createElement('div');
    results.className = 'full-overlay group-results-overlay';
    results.style.background = 'rgba(5,5,8,0.98)';
    
    groupSessionResults.sort((a,b) => b.score - a.score);
    const winner = groupSessionResults[0];

    results.innerHTML = `
        <div class="overlay-box" style="max-width:600px">
            <h2 style="color:var(--primary)">GROUP <span class="accent">FINALE</span></h2>
            <div style="margin:2rem 0">
                <div style="font-size:0.8rem; letter-spacing:2px">CHAMPION</div>
                <h1 style="font-size:3rem; color:var(--secondary)">${winner.name.toUpperCase()}</h1>
                <p style="color:var(--primary)">SCORE: ${winner.score}</p>
            </div>
            <div class="lb-container" style="text-align:left; background:rgba(255,255,255,0.02); padding:1.5rem; border-radius:16px; margin-bottom:2rem;">
                ${groupSessionResults.map((r, i) => `
                    <div class="lb-entry" style="border:none; margin-bottom:5px; background:rgba(255,255,255,${i===0?0.05:0.02})">
                        <span class="lb-rank">${i+1}</span>
                        <span class="lb-name">${r.name}</span>
                        <span class="lb-score">${r.score}</span>
                    </div>
                `).join('')}
            </div>
            <button class="cyber-btn primary-c" onclick="location.reload()">
                <span>NEW SESSION</span>
            </button>
        </div>
    `;
    document.body.appendChild(results);
}

// Step 5: Next student
function nextStudent() {
    gameState = 'welcome';
    selectedGame = null;
    balls = [];
    catchFX = [];
    scorePops = [];
    currentLandmarks = null;

    hideOverlay(turnEndOverlay);
    showOverlay(welcomeOverlay);

    cameraStatusText.textContent = "READY";
    btnStart.disabled = false;
    btnStart.querySelector('span').textContent = "ENTER ARENA";
    document.getElementById('cam-status-text').textContent = "CAMERA READY";
    nameInput.value = '';
    hudPlayer.textContent = 'PLAYER: —';
    scoreDisplay.textContent = '0';
    waveDisplay.textContent = '0/5';
}

// End tournament
function endTournament() {
    gameState = 'results';
    clearTimeout(spawnTimerId);
    clearInterval(countdownTimerId);

    // Save current player if mid-game
    if (playerName && gameState !== 'welcome') {
        const alreadySaved = leaderboard.some(e => e.name === playerName && e.score === score);
        if (!alreadySaved) {
            leaderboard.push({ name: playerName, score });
            leaderboard.sort((a, b) => b.score - a.score);
            localStorage.setItem('neural_basket_lb', JSON.stringify(leaderboard));
        }
    }

    // Hide everything
  // ════════════════════════════════════════
//          PLAY MODE / GROUP MGMT
// ════════════════════════════════════════

function setPlayMode(mode) {
    playMode = mode;
    hideOverlay(document.getElementById('mode-select-overlay'));
    showOverlay(welcomeOverlay);
    
    if (mode === 'solo') {
        document.getElementById('solo-signup').style.display = 'block';
        document.getElementById('group-signup').style.display = 'none';
        playerNameInput.focus();
    } else {
        document.getElementById('solo-signup').style.display = 'none';
        document.getElementById('group-signup').style.display = 'block';
        document.getElementById('group-name-input').focus();
        groupPlayers = [];
        updateGroupList();
    }
}

function backToModeSelect() {
    hideOverlay(welcomeOverlay);
    showOverlay(document.getElementById('mode-select-overlay'));
}

document.getElementById('btn-add-player').onclick = () => {
    const input = document.getElementById('group-name-input');
    const name = input.value.trim();
    if (name && groupPlayers.length < 3) {
        groupPlayers.push(name);
        input.value = '';
        updateGroupList();
        input.focus();
    }
};

document.getElementById('group-name-input').onkeypress = (e) => {
    if (e.key === 'Enter') document.getElementById('btn-add-player').click();
};

function updateGroupList() {
    const list = document.getElementById('group-list');
    const btn = document.getElementById('btn-start-group');
    const limitMsg = document.getElementById('group-limit-msg');
    
    list.innerHTML = groupPlayers.map((name, i) => `
        <div class="player-chip">
            <span>${name}</span>
            <span class="remove-chip" onclick="removePlayer(${i})">×</span>
        </div>
    `).join('');
    
    const count = groupPlayers.length;
    btn.disabled = count !== 3; // Strict 3 students
    btn.querySelector('span').textContent = `START GROUP BATTLE (${count}/3)`;
    
    if (count === 3) {
        limitMsg.textContent = "READY! EXACTLY 3 STUDENTS DETECTED.";
        limitMsg.style.color = "var(--primary)";
    } else {
        limitMsg.textContent = `Required: 3 Students (${3 - count} more needed)`;
        limitMsg.style.color = "var(--secondary)";
    }
}

function removePlayer(idx) {
    groupPlayers.splice(idx, 1);
    updateGroupList();
}

document.getElementById('btn-start-group').onclick = () => {
    currentPlayerIndex = 0;
    groupSessionResults = [];
    playerName = groupPlayers[0];
    hideOverlay(welcomeOverlay);
    showOverlay(gameSelectOverlay);
};

// Start Solo Game
btnStart.onclick = () => {
    playerName = playerNameInput.value.trim();
    if (!playerName) return;
    hideOverlay(welcomeOverlay);
    showOverlay(gameSelectOverlay);
};
    hideOverlay(welcomeOverlay);
    hideOverlay(calibrateOverlay);
    hideOverlay(countdownOverlay);
    hideOverlay(turnEndOverlay);
    hideOverlay(gameSelectOverlay);
    // Also hide archery overlays if they exist
    if (archCalibOverlay) hideOverlay(archCalibOverlay);
    document.getElementById('archery-hud').style.display = 'none';

    if (leaderboard.length > 0) {
        const w = leaderboard[0];
        winnerAnnounce.innerHTML = `
            <div style="font-family:var(--font-mono);font-size:0.5rem;color:var(--text-dim);letter-spacing:2px;margin-bottom:0.3rem;">🥇 CHAMPION</div>
            <div class="winner-name">${w.name}</div>
            <div class="winner-score">${w.score} / ${TOTAL_BALLS}</div>
        `;
        finalLeaderboard.innerHTML = leaderboard.slice(0, 10).map((e, i) => `
            <div class="final-entry ${i === 0 ? 'gold' : ''}">
                <span class="final-rank">${(i + 1).toString().padStart(2, '0')}</span>
                <span class="final-name">${e.name}</span>
                <span class="final-score">${e.score}/${TOTAL_BALLS}</span>
            </div>
        `).join('');
    } else {
        winnerAnnounce.innerHTML = '<p>No players competed.</p>';
        finalLeaderboard.innerHTML = '';
    }

    showOverlay(resultsOverlay);
}


// ════════════════════════════════════════
//           HUD & LEADERBOARD
// ════════════════════════════════════════

function updateHUD() {
    scoreDisplay.textContent = score;
    waveDisplay.textContent = `${waveNum}/${MAX_WAVES}`;
    hudBalls.textContent = `BALLS: ${totalResolved}/${TOTAL_BALLS}`;
    hudLive.textContent = `AIRBORNE: ${balls.length}`;
    statLive.textContent = balls.length;
    statMissed.textContent = missed;
    const rate = totalResolved > 0 ? (score / totalResolved * 100) : 0;
    catchRateBar.style.width = rate + '%';
}

function renderSidebarLB() {
    const data = currentLBView === 'basket' ? leaderboard : (typeof archLeaderboard !== 'undefined' ? archLeaderboard : []);
    
    if (data.length === 0) {
        lbContainer.innerHTML = '<div class="empty-state">No players yet</div>';
        return;
    }
    
    lbContainer.innerHTML = data.slice(0, 8).map((e, i) => `
        <div class="lb-entry">
            <span class="lb-rank">${(i + 1).toString().padStart(2, '0')}</span>
            <span class="lb-name">${e.name}</span>
            <span class="lb-score">${e.score}</span>
        </div>
    `).join('');
}

function switchLB(view) {
    currentLBView = view;
    updateLBTabs();
    renderSidebarLB();
}

function updateLBTabs() {
    document.getElementById('tab-basket').className = 'lb-tab' + (currentLBView === 'basket' ? ' active' : '');
    document.getElementById('tab-archery').className = 'lb-tab' + (currentLBView === 'archery' ? ' active' : '');
}

function screenShake() {
    const container = document.getElementById('game-viewport');
    container.classList.add('shake');
    setTimeout(() => container.classList.remove('shake'), 400);
}

function showOverlay(el) { el.style.display = 'flex'; requestAnimationFrame(() => el.style.opacity = '1'); }
function hideOverlay(el) { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 400); }


// ════════════════════════════════════════
//             RENDERING
// ════════════════════════════════════════

function render() {
    ctx.clearRect(0, 0, worldW, worldH);

    if (gameState === 'playing') {
        drawBasket();
        drawBalls();
        drawHandSkeleton();
        drawCatchFX();
        drawScorePops();

        // Score watermark
        ctx.save();
        ctx.font = 'bold 100px Outfit';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,255,136,0.04)';
        ctx.fillText(score, worldW / 2, worldH / 2 + 35);
        ctx.restore();
    }

    // Also draw hand skeleton during calibration/countdown so student sees feedback
    if (gameState === 'calibrating' || gameState === 'countdown') {
        drawHandSkeleton();
    }

    // Tutorial task rendering
    if (gameState === 'tutorialTask') {
        renderTutorialTask();
    }

    // Archery game rendering
    if (gameState === 'archeryPlaying' && typeof archeryRender === 'function') {
        archeryRender();
    }

    // Draw hand skeleton during archery calibration
    if (gameState === 'archeryCal') {
        drawHandSkeleton();
    }
}

function drawBasket() {
    const bk = getBasketGeo();

    ctx.save();

    // Body (trapezoid)
    ctx.beginPath();
    ctx.moveTo(bk.ltx, bk.ty);
    ctx.lineTo(bk.rtx, bk.ty);
    ctx.lineTo(bk.rbx, bk.by);
    ctx.lineTo(bk.lbx, bk.by);
    ctx.closePath();

    const fill = ctx.createLinearGradient(basket.x, bk.ty, basket.x, bk.by);
    fill.addColorStop(0, 'rgba(0,189,255,0.04)');
    fill.addColorStop(1, 'rgba(0,189,255,0.12)');
    ctx.fillStyle = fill;
    ctx.fill();

    // Walls (3 sides)
    ctx.beginPath();
    ctx.moveTo(bk.ltx, bk.ty);
    ctx.lineTo(bk.lbx, bk.by);
    ctx.lineTo(bk.rbx, bk.by);
    ctx.lineTo(bk.rtx, bk.ty);
    ctx.strokeStyle = '#00bdff';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(0,189,255,0.5)';
    ctx.stroke();

    // Cross-hatch
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,189,255,0.06)';
    ctx.lineWidth = 1;
    for (let h = 1; h <= 4; h++) {
        const t = h / 5;
        const y = bk.ty + BASKET_H * t;
        const lx = bk.ltx + (bk.lbx - bk.ltx) * t;
        const rx = bk.rtx + (bk.rbx - bk.rtx) * t;
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(rx, y); ctx.stroke();
    }

    // Glowing rim
    ctx.beginPath();
    ctx.moveTo(bk.ltx - 4, bk.ty);
    ctx.lineTo(bk.rtx + 4, bk.ty);
    ctx.strokeStyle = '#00bdff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 18;
    ctx.shadowColor = 'rgba(0,189,255,0.7)';
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.font = '8px Syncopate';
    ctx.fillStyle = 'rgba(0,189,255,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('BASKET', basket.x, bk.by - 6);

    ctx.restore();
}

function drawBalls() {
    balls.forEach(b => {
        if (!b.alive) return;

        // Trail
        b.trail.forEach((t, idx) => {
            const alpha = (idx / b.trail.length) * 0.18;
            ctx.beginPath();
            ctx.arc(t.x, t.y, b.r * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = b.color;
            ctx.globalAlpha = alpha;
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Glow + ball
        ctx.shadowBlur = 10;
        ctx.shadowColor = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 0, b.x, b.y, b.r);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.3, b.color);
        g.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.shadowBlur = 0;
    });
}

function drawHandSkeleton() {
    if (!currentLandmarks) return;
    const pts = currentLandmarks.map(p => ({ x: p.x * worldW, y: p.y * worldH }));

    const conns = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    ctx.strokeStyle = 'rgba(0,255,136,0.2)';
    ctx.lineWidth = 1.5;
    conns.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke(); });

    pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = [0,4,8,12,16,20].includes(i) ? '#00bdff' : '#00ff88';
        ctx.fill();
    });
}

function drawCatchFX() {
    catchFX.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

function drawScorePops() {
    scorePops.forEach(p => {
        ctx.save();
        ctx.font = `bold ${18 + (1 - p.life) * 10}px Outfit`;
        ctx.textAlign = 'center';
        ctx.fillStyle = p.text.includes('-') ? '#ff0055' : '#00ff88';
        ctx.globalAlpha = p.life;
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillText(p.text || '+1', p.x, p.y);
        ctx.restore();
    });
}


// ════════════════════════════════════════
//          MEDIAPIPE HANDLER
// ════════════════════════════════════════

function onResults(results) {
    if (loadingOverlay.style.display !== 'none') {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            cameraReady = true;
            gameState = 'welcome';
            if (nameInput.value.trim()) {
                btnStart.disabled = false;
                btnStart.querySelector('span').textContent = 'START';
            } else {
                btnStart.disabled = true;
                btnStart.querySelector('span').textContent = 'ENTER YOUR NAME';
            }
        }, 500);
    }

    if (videoEl.videoWidth > 0 && canvas.width !== videoEl.videoWidth) {
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        worldW = canvas.width;
        worldH = canvas.height;
    }

    processHand(results);
}


// ════════════════════════════════════════
//           MAIN LOOP
// ════════════════════════════════════════

function gameLoop() {
    if (gameState === 'playing') {
        updatePhysics();
        updateHUD();
    }
    if (gameState === 'tutorialTask') {
        updateTutorialTask();
    }
    if (gameState === 'archeryPlaying' && typeof archeryUpdate === 'function') {
        archeryUpdate();
    }
    render();
    requestAnimationFrame(gameLoop);
}


// ════════════════════════════════════════
//         BACKGROUND PARTICLES
// ════════════════════════════════════════

const bgCanvas = document.getElementById('bg-particles');
const bgCtx = bgCanvas.getContext('2d');
let bgParts = [];

function initBg() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    bgParts = [];
    for (let i = 0; i < 30; i++) bgParts.push({ x: Math.random() * bgCanvas.width, y: Math.random() * bgCanvas.height, r: Math.random() * 1.5 + 0.5, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3 });
}

function animBg() {
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgParts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = bgCanvas.width; if (p.x > bgCanvas.width) p.x = 0;
        if (p.y < 0) p.y = bgCanvas.height; if (p.y > bgCanvas.height) p.y = 0;
        bgCtx.beginPath(); bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2); bgCtx.fillStyle = 'rgba(0,255,136,0.15)'; bgCtx.fill();
    });
    requestAnimationFrame(animBg);
}


// ════════════════════════════════════════
//          TUTORIAL SYSTEM
// ════════════════════════════════════════

const TOTAL_SLIDES = 6;
const SLIDE_DURATION = 5000;
const TUTORIAL_TASKS = [
    { id: 'draw_line', name: 'DRAW A LINE', icon: '✋', instruction: 'Move your hand across the screen to draw a glowing neon trail' },
    { id: 'fireball', name: 'MAGIC FIREBALL', icon: '🔥', instruction: 'Hold still to charge a fireball, then flick your hand to throw it!' },
    { id: 'catch_ball', name: 'CATCH A BALL', icon: '🏀', instruction: 'Position the basket under the falling ball to catch it' },
    { id: 'throw_ball', name: 'THROW A BALL', icon: '⬆️', instruction: 'The ball follows your hand — flick upward quickly to throw it!' },
    { id: 'shoot_target', name: 'SHOOT TARGET', icon: '🎯', instruction: 'Charge a fireball and flick it toward the glowing target' }
];

let tutCurrentSlide = 0;
let tutSlideTimer = null;
let tutCurrentTask = null;
let tutTaskProgress = 0;
let tutLinePoints = [];
let tutLineDistance = 0;
let tutFireball = null;
let tutFireParticles = [];
let tutTaskBall = null;
let tutTarget = null;
let tutPrevHandPos = null;
let tutHandVelocity = { x: 0, y: 0 };
let tutFireballChargeTime = 0;

// ── TUTORIAL VIDEO ──

function startTutorialVideo() {
    gameState = 'tutorialVideo';
    tutCurrentSlide = 0;

    const dotsEl = document.getElementById('tut-slide-dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < TOTAL_SLIDES; i++) {
        const dot = document.createElement('div');
        dot.className = 'tut-dot' + (i === 0 ? ' active' : '');
        dotsEl.appendChild(dot);
    }

    showTutSlide(0);
    showOverlay(tutorialVideoOverlay);
    startSlideTimer();
}

function showTutSlide(index) {
    document.querySelectorAll('.tut-slide').forEach(s => s.classList.remove('active'));
    const slide = document.getElementById(`tut-slide-${index}`);
    if (slide) {
        slide.classList.add('active');
        slide.style.animation = 'none';
        void slide.offsetHeight;
        slide.style.animation = '';
    }
    document.getElementById('tut-slide-counter').textContent = `${index + 1} / ${TOTAL_SLIDES}`;
    document.querySelectorAll('.tut-dot').forEach((dot, i) => {
        dot.className = 'tut-dot' + (i < index ? ' done' : '') + (i === index ? ' active' : '');
    });
}

function startSlideTimer() {
    clearInterval(tutSlideTimer);
    let elapsed = 0;
    const fillEl = document.getElementById('tut-progress-fill');

    tutSlideTimer = setInterval(() => {
        elapsed += 50;
        const totalElapsed = tutCurrentSlide * SLIDE_DURATION + elapsed;
        const totalDuration = TOTAL_SLIDES * SLIDE_DURATION;
        fillEl.style.width = (totalElapsed / totalDuration * 100) + '%';

        if (elapsed >= SLIDE_DURATION) {
            elapsed = 0;
            tutCurrentSlide++;
            if (tutCurrentSlide >= TOTAL_SLIDES) {
                clearInterval(tutSlideTimer);
                tutSlideTimer = null;
                fillEl.style.width = '100%';
                tutVideoWatched = true;
                setTimeout(() => {
                    hideOverlay(tutorialVideoOverlay);
                    showTutorialTasksMenu();
                }, 1200);
            } else {
                showTutSlide(tutCurrentSlide);
            }
        }
    }, 50);
}

// ── TUTORIAL TASKS MENU ──

function showTutorialTasksMenu() {
    gameState = 'tutorialMenu';
    renderTaskCards();
    showOverlay(tutorialTasksOverlay);
}

function renderTaskCards() {
    const container = document.getElementById('task-cards');
    container.innerHTML = TUTORIAL_TASKS.map(task => `
        <div class="task-card ${tutCompletedTasks.has(task.id) ? 'completed' : ''}" data-task="${task.id}">
            <div class="task-card-icon">${task.icon}</div>
            <div class="task-card-name">${task.name}</div>
            <div class="task-card-status">${tutCompletedTasks.has(task.id) ? '✓ DONE' : 'START →'}</div>
        </div>
    `).join('');

    container.querySelectorAll('.task-card:not(.completed)').forEach(card => {
        card.addEventListener('click', function() { startTutorialTask(this.dataset.task); });
    });

    const count = tutCompletedTasks.size;
    document.getElementById('tut-tasks-status').textContent = `${count} / 2 COMPLETED`;
    document.getElementById('tut-tasks-progress-fill').style.width = Math.min(count / 2 * 100, 100) + '%';

    const btnGame = document.getElementById('btn-start-game');
    if (count >= 2) {
        btnGame.disabled = false;
        btnGame.querySelector('span').textContent = '🎮 START THE GAME';
    } else {
        btnGame.disabled = true;
        btnGame.querySelector('span').textContent = `COMPLETE ${2 - count} MORE TASK${2 - count > 1 ? 'S' : ''} TO UNLOCK 🔒`;
    }
}

// ── START / UPDATE / RENDER TUTORIAL TASKS ──

function startTutorialTask(taskId) {
    if (tutCompletedTasks.has(taskId)) return;
    const task = TUTORIAL_TASKS.find(t => t.id === taskId);
    if (!task) return;

    tutCurrentTask = task;
    gameState = 'tutorialTask';
    tutTaskProgress = 0;
    tutLinePoints = [];
    tutLineDistance = 0;
    tutFireball = null;
    tutFireParticles = [];
    tutTaskBall = null;
    tutTarget = null;
    tutPrevHandPos = null;
    tutHandVelocity = { x: 0, y: 0 };
    tutFireballChargeTime = 0;

    switch (taskId) {
        case 'catch_ball':
            tutTaskBall = { x: 100 + Math.random() * (worldW - 200), y: -30, r: 15, vy: 1.5, color: '#FF6B35', alive: true };
            break;
        case 'throw_ball':
            tutTaskBall = { x: worldW / 2, y: worldH / 2, r: 15, vy: 0, vx: 0, color: '#00C9FF', held: true };
            break;
        case 'shoot_target':
            tutTarget = { x: 150 + Math.random() * (worldW - 300), y: 80 + Math.random() * 200, r: 45, phase: 0 };
            break;
    }

    hideOverlay(tutorialTasksOverlay);
    const hudEl = document.getElementById('active-task-hud');
    hudEl.style.display = 'flex';
    document.getElementById('task-hud-icon').textContent = task.icon;
    document.getElementById('task-hud-name').textContent = task.name;
    document.getElementById('task-hud-instruction').textContent = task.instruction;
    document.getElementById('task-hud-pct').textContent = '0%';
    document.getElementById('task-progress-bar-fill').style.width = '0%';
}

function updateTutorialTask() {
    if (!tutCurrentTask || gameState !== 'tutorialTask') return;

    // Smooth basket
    basket.x += (basketTarget.x - basket.x) * 0.45;
    basket.y += (basketTarget.y - basket.y) * 0.45;
    basket.x = Math.max(BASKET_W / 2 + 10, Math.min(worldW - BASKET_W / 2 - 10, basket.x));
    basket.y = Math.max(BASKET_H + 30, Math.min(worldH - 20, basket.y));

    const handPos = handVisible ? { x: basketTarget.x, y: basketTarget.y } : null;

    if (handPos && tutPrevHandPos) {
        tutHandVelocity.x = handPos.x - tutPrevHandPos.x;
        tutHandVelocity.y = handPos.y - tutPrevHandPos.y;
    } else {
        tutHandVelocity = { x: 0, y: 0 };
    }
    if (handPos) tutPrevHandPos = { x: handPos.x, y: handPos.y };

    switch (tutCurrentTask.id) {
        case 'draw_line':
            if (handPos) {
                if (tutLinePoints.length > 0) {
                    const last = tutLinePoints[tutLinePoints.length - 1];
                    const dist = Math.sqrt((handPos.x - last.x) ** 2 + (handPos.y - last.y) ** 2);
                    if (dist > 2) { tutLineDistance += dist; tutLinePoints.push({ x: handPos.x, y: handPos.y, age: 0 }); }
                } else {
                    tutLinePoints.push({ x: handPos.x, y: handPos.y, age: 0 });
                }
                if (tutLinePoints.length > 300) tutLinePoints.shift();
            }
            tutLinePoints.forEach(p => p.age++);
            tutTaskProgress = Math.min(100, (tutLineDistance / 1200) * 100);
            break;

        case 'fireball':
            if (handPos) {
                if (!tutFireball) { tutFireballChargeTime++; if (tutFireballChargeTime > 30) tutFireball = { x: handPos.x, y: handPos.y, r: 8, launched: false, vx: 0, vy: 0 }; }
                if (tutFireball && !tutFireball.launched) {
                    tutFireball.x = handPos.x; tutFireball.y = handPos.y;
                    if (tutFireball.r < 28) tutFireball.r += 0.2;
                    const speed = Math.sqrt(tutHandVelocity.x ** 2 + tutHandVelocity.y ** 2);
                    if (speed > 15 && tutFireball.r > 15) { tutFireball.launched = true; tutFireball.vx = tutHandVelocity.x * 2.5; tutFireball.vy = tutHandVelocity.y * 2.5; tutTaskProgress = 50; }
                }
            }
            if (tutFireball && tutFireball.launched) {
                tutFireball.x += tutFireball.vx; tutFireball.y += tutFireball.vy;
                for (let i = 0; i < 3; i++) tutFireParticles.push({ x: tutFireball.x + (Math.random()-0.5)*10, y: tutFireball.y + (Math.random()-0.5)*10, r: Math.random()*6+2, life: 1, vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2 });
                if (tutFireball.x < -60 || tutFireball.x > worldW+60 || tutFireball.y < -60 || tutFireball.y > worldH+60) tutTaskProgress = 100;
            }
            tutFireParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.04; p.r *= 0.97; });
            tutFireParticles = tutFireParticles.filter(p => p.life > 0);
            break;

        case 'catch_ball':
            if (tutTaskBall && tutTaskBall.alive) {
                tutTaskBall.vy += 0.12; tutTaskBall.y += tutTaskBall.vy;
                const bk = getBasketGeo();
                if (tutTaskBall.x > bk.ltx && tutTaskBall.x < bk.rtx && tutTaskBall.y + tutTaskBall.r > bk.ty && tutTaskBall.y - tutTaskBall.r < bk.by && tutTaskBall.y + tutTaskBall.r >= bk.by - 5) {
                    tutTaskProgress = 100; tutTaskBall.alive = false;
                }
                if (tutTaskBall.y > worldH + 60) { tutTaskBall.y = -30; tutTaskBall.vy = 1.2 + Math.random(); tutTaskBall.x = 100 + Math.random()*(worldW-200); }
            }
            break;

        case 'throw_ball':
            if (tutTaskBall) {
                if (tutTaskBall.held && handPos) {
                    tutTaskBall.x = handPos.x; tutTaskBall.y = handPos.y - 25;
                    if (tutHandVelocity.y < -12) { tutTaskBall.held = false; tutTaskBall.vy = tutHandVelocity.y * 2; tutTaskBall.vx = tutHandVelocity.x * 0.5; tutTaskProgress = 50; }
                } else if (!tutTaskBall.held) {
                    tutTaskBall.vy += 0.15; tutTaskBall.x += tutTaskBall.vx; tutTaskBall.y += tutTaskBall.vy;
                    if (tutTaskBall.y < -50) tutTaskProgress = 100;
                    if (tutTaskBall.y > worldH + 100) { tutTaskBall.held = true; tutTaskBall.vy = 0; tutTaskBall.vx = 0; tutTaskProgress = 0; }
                }
            }
            break;

        case 'shoot_target':
            if (tutTarget) tutTarget.phase += 0.05;
            if (handPos) {
                if (!tutFireball) { tutFireballChargeTime++; if (tutFireballChargeTime > 20) tutFireball = { x: handPos.x, y: handPos.y, r: 8, launched: false, vx: 0, vy: 0 }; }
                if (tutFireball && !tutFireball.launched) {
                    tutFireball.x = handPos.x; tutFireball.y = handPos.y;
                    if (tutFireball.r < 22) tutFireball.r += 0.25;
                    const speed = Math.sqrt(tutHandVelocity.x ** 2 + tutHandVelocity.y ** 2);
                    if (speed > 15 && tutFireball.r > 12) { tutFireball.launched = true; tutFireball.vx = tutHandVelocity.x * 2.5; tutFireball.vy = tutHandVelocity.y * 2.5; }
                }
            }
            if (tutFireball && tutFireball.launched) {
                tutFireball.x += tutFireball.vx; tutFireball.y += tutFireball.vy;
                for (let i = 0; i < 2; i++) tutFireParticles.push({ x: tutFireball.x + (Math.random()-0.5)*8, y: tutFireball.y + (Math.random()-0.5)*8, r: Math.random()*5+2, life: 1, vx: (Math.random()-0.5)*1.5, vy: (Math.random()-0.5)*1.5 });
                if (tutTarget) {
                    const dx = tutFireball.x - tutTarget.x, dy = tutFireball.y - tutTarget.y;
                    if (Math.sqrt(dx*dx + dy*dy) < tutTarget.r + tutFireball.r) {
                        tutTaskProgress = 100;
                        for (let i = 0; i < 20; i++) { const a = (Math.PI*2/20)*i; tutFireParticles.push({ x: tutTarget.x, y: tutTarget.y, r: Math.random()*6+3, life: 1, vx: Math.cos(a)*(3+Math.random()*4), vy: Math.sin(a)*(3+Math.random()*4) }); }
                        tutTarget = null;
                    }
                }
                if (tutFireball.x < -60 || tutFireball.x > worldW+60 || tutFireball.y < -60 || tutFireball.y > worldH+60) { tutFireball = null; tutFireballChargeTime = 0; }
            }
            tutFireParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.04; });
            tutFireParticles = tutFireParticles.filter(p => p.life > 0);
            break;
    }

    document.getElementById('task-hud-pct').textContent = Math.round(tutTaskProgress) + '%';
    document.getElementById('task-progress-bar-fill').style.width = tutTaskProgress + '%';
    if (tutTaskProgress >= 100) completeTutorialTask();
}

function renderTutorialTask() {
    if (!tutCurrentTask || gameState !== 'tutorialTask') return;
    drawHandSkeleton();

    if (!handVisible) {
        ctx.save();
        ctx.font = '600 22px Inter'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('✋ Show your hand to continue', worldW / 2, worldH / 2);
        ctx.restore();
        return;
    }

    switch (tutCurrentTask.id) {
        case 'draw_line':
            if (tutLinePoints.length > 1) {
                for (let i = 1; i < tutLinePoints.length; i++) {
                    const p0 = tutLinePoints[i-1], p1 = tutLinePoints[i];
                    const alpha = Math.max(0, 1 - p1.age / 200);
                    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
                    ctx.strokeStyle = `rgba(0,255,136,${alpha})`; ctx.lineWidth = 3;
                    ctx.shadowBlur = alpha > 0.3 ? 12 : 0; ctx.shadowColor = '#00ff88';
                    ctx.stroke(); ctx.shadowBlur = 0;
                }
                const last = tutLinePoints[tutLinePoints.length - 1];
                ctx.beginPath(); ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#00ff88'; ctx.shadowBlur = 15; ctx.shadowColor = '#00ff88'; ctx.fill(); ctx.shadowBlur = 0;
            }
            break;

        case 'fireball':
        case 'shoot_target':
            if (tutCurrentTask.id === 'shoot_target' && tutTarget) {
                ctx.save();
                const tp = tutTarget, pulse = 1 + Math.sin(tp.phase) * 0.15;
                ctx.strokeStyle = '#ff0055'; ctx.lineWidth = 2; ctx.shadowBlur = 20; ctx.shadowColor = '#ff0055';
                ctx.beginPath(); ctx.arc(tp.x, tp.y, tp.r * pulse, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(tp.x, tp.y, tp.r * 0.45 * pulse, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(tp.x, tp.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#ff0055'; ctx.fill();
                ctx.beginPath(); ctx.moveTo(tp.x - tp.r * pulse, tp.y); ctx.lineTo(tp.x + tp.r * pulse, tp.y);
                ctx.moveTo(tp.x, tp.y - tp.r * pulse); ctx.lineTo(tp.x, tp.y + tp.r * pulse); ctx.stroke();
                ctx.shadowBlur = 0; ctx.restore();
            }
            if (tutFireball) {
                ctx.save(); const fb = tutFireball;
                const grad = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, fb.r);
                grad.addColorStop(0, '#fff'); grad.addColorStop(0.2, '#ffcc00'); grad.addColorStop(0.5, '#ff6b35');
                grad.addColorStop(0.8, '#ff3b5c'); grad.addColorStop(1, 'rgba(255,59,92,0)');
                ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r, 0, Math.PI * 2);
                ctx.fillStyle = grad; ctx.shadowBlur = 30; ctx.shadowColor = '#ff6b35'; ctx.fill();
                ctx.shadowBlur = 0; ctx.restore();
            }
            tutFireParticles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, p.r * p.life), 0, Math.PI * 2); ctx.fillStyle = `rgba(255,107,53,${Math.max(0,p.life)})`; ctx.fill(); });
            if (tutFireball && !tutFireball.launched) {
                ctx.save(); ctx.font = '600 14px Inter'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,200,100,0.7)';
                ctx.fillText('Flick to throw! →', tutFireball.x, tutFireball.y - tutFireball.r - 15); ctx.restore();
            }
            if (!tutFireball) {
                ctx.save(); ctx.font = '600 16px Inter'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,200,100,0.5)';
                ctx.fillText('Hold still to charge fireball...', worldW / 2, worldH - 60); ctx.restore();
            }
            break;

        case 'catch_ball':
            drawBasket();
            if (tutTaskBall && tutTaskBall.alive) {
                ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = tutTaskBall.color;
                ctx.beginPath(); ctx.arc(tutTaskBall.x, tutTaskBall.y, tutTaskBall.r, 0, Math.PI * 2);
                const g = ctx.createRadialGradient(tutTaskBall.x-2, tutTaskBall.y-2, 0, tutTaskBall.x, tutTaskBall.y, tutTaskBall.r);
                g.addColorStop(0, '#fff'); g.addColorStop(0.3, tutTaskBall.color); g.addColorStop(1, 'rgba(0,0,0,0.15)');
                ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
            }
            break;

        case 'throw_ball':
            if (tutTaskBall) {
                ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = tutTaskBall.color;
                ctx.beginPath(); ctx.arc(tutTaskBall.x, tutTaskBall.y, tutTaskBall.r, 0, Math.PI * 2);
                const g2 = ctx.createRadialGradient(tutTaskBall.x-2, tutTaskBall.y-2, 0, tutTaskBall.x, tutTaskBall.y, tutTaskBall.r);
                g2.addColorStop(0, '#fff'); g2.addColorStop(0.3, tutTaskBall.color); g2.addColorStop(1, 'rgba(0,0,0,0.15)');
                ctx.fillStyle = g2; ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
                if (tutTaskBall.held) {
                    ctx.save(); ctx.font = '600 14px Inter'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,189,255,0.6)';
                    ctx.fillText('↑ Flick UP to throw!', tutTaskBall.x, tutTaskBall.y - 30); ctx.restore();
                }
            }
            break;
    }
}

function completeTutorialTask() {
    if (!tutCurrentTask) return;
    tutCompletedTasks.add(tutCurrentTask.id);
    gameState = 'tutorialComplete';
    tutCurrentTask = null;

    const popup = document.getElementById('task-complete-popup');
    const msgs = ['Excellent work!', "You're a natural!", 'Perfect execution!', 'Amazing skill!', 'Well done!'];
    document.getElementById('task-complete-msg').textContent = msgs[Math.floor(Math.random() * msgs.length)];
    popup.style.display = 'flex';

    setTimeout(() => {
        popup.style.display = 'none';
        document.getElementById('active-task-hud').style.display = 'none';
        showTutorialTasksMenu();
    }, 1800);
}

function cancelTutorialTask() {
    tutCurrentTask = null;
    gameState = 'tutorialMenu';
    document.getElementById('active-task-hud').style.display = 'none';
    showTutorialTasksMenu();
}

function skipTutorial() {
    clearInterval(tutSlideTimer);
    tutSlideTimer = null;
    tutorialCompleted = true;
    sessionStorage.setItem('neural_basket_tutorial_done', 'true');

    hideOverlay(tutorialVideoOverlay);
    hideOverlay(tutorialTasksOverlay);
    document.getElementById('active-task-hud').style.display = 'none';
    document.getElementById('task-complete-popup').style.display = 'none';

    proceedToCalibration();
}

function startGameFromTutorial() {
    tutorialCompleted = true;
    sessionStorage.setItem('neural_basket_tutorial_done', 'true');
    hideOverlay(tutorialTasksOverlay);
    proceedToCalibration();
}


// ════════════════════════════════════════
//           EVENTS & BOOT
// ════════════════════════════════════════

btnStart.addEventListener('click', goToCalibration);
btnEndGame.addEventListener('click', endTournament);

// Tutorial event listeners
document.getElementById('btn-skip-tut-video').addEventListener('click', skipTutorial);
document.getElementById('btn-skip-tut-tasks').addEventListener('click', skipTutorial);
document.getElementById('btn-start-game').addEventListener('click', startGameFromTutorial);
document.getElementById('btn-task-cancel').addEventListener('click', cancelTutorialTask);

// Game selection event listeners
document.getElementById('select-basket').addEventListener('click', () => selectGame('basket'));
document.getElementById('select-archery').addEventListener('click', () => selectGame('archery'));

nameInput.addEventListener('input', () => {
    if (nameInput.value.trim() && cameraReady) {
        btnStart.disabled = false;
        btnStart.querySelector('span').textContent = 'START';
    } else {
        btnStart.disabled = true;
        btnStart.querySelector('span').textContent = cameraReady ? 'ENTER YOUR NAME' : 'WAITING FOR CAMERA...';
    }
});

nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !btnStart.disabled) goToCalibration();
});

window.addEventListener('resize', initBg);

// BOOT
initBg();
animBg();
renderSidebarLB();
gameLoop();

const hands = new Hands({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
hands.onResults(onResults);

const camera = new Camera(videoEl, {
    onFrame: async () => { try { await hands.send({ image: videoEl }); } catch (e) { console.error(e); } },
    width: 1280, height: 720
});
camera.start().catch(err => {
    console.error('Camera error:', err);
    hudLink.textContent = 'HAND_LINK: CAM_DENIED';
    btnStart.querySelector('span').textContent = 'CAMERA DENIED';
});
