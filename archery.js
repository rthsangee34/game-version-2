// ════════════════════════════════════════════════════════════════════
//
//              SHARP SHOOTER — ARCHERY GAME ENGINE
//              Two-handed bow & arrow with stability mechanics
//
// ════════════════════════════════════════════════════════════════════

// ── DOM REFS ──
const archTutOverlay    = document.getElementById('archery-tutorial-overlay');
const archCalibOverlay  = document.getElementById('archery-calibrate-overlay');
const archShotPopup     = document.getElementById('archery-shot-popup');
const archEndOverlay    = document.getElementById('archery-end-overlay');

// ── BUTTONS ──
document.getElementById('btn-arch-next').onclick = () => archeryNextStudent();
document.getElementById('btn-arch-end-tourn').onclick = () => endArcheryTournament();

// ── CONFIG ──
const ARCH_MAX_SHOTS      = 5;
const ARCH_DRAW_THRESHOLD = 120;   // min draw distance in px
const ARCH_RELEASE_SPEED  = 45;    // velocity drop to detect release
const ARCH_STABILITY_FRAMES = 25;  // frames to sample for stability
const ARCH_ARROW_SPEED    = 28;
const ARCH_TARGET_RINGS   = [
    { radius: 0.055, score: 10, color: '#FFD700' },
    { radius: 0.10,  score: 9,  color: '#FF6B35' },
    { radius: 0.155, score: 8,  color: '#FF3B5C' },
    { radius: 0.21,  score: 7,  color: '#E040FB' },
    { radius: 0.27,  score: 6,  color: '#00BDFF' },
    { radius: 0.34,  score: 5,  color: '#00FF88' },
    { radius: 0.42,  score: 1,  color: '#444'    }
];

// ── STATE ──
let archState         = 'idle';        // idle, aiming, drawing, fired, scored, waiting, ended
let archScore         = 0;
let archShotNum       = 0;
let archShotResults   = [];
let archBowHand       = null;          // {x,y}
let archDrawHand      = null;          // {x,y}
let archBowHistory    = [];            // recent bow positions for stability
let archStability     = 1.0;           // 0=shaky, 1=rock solid
let archDrawDist      = 0;
let archPrevDrawDist  = 0;
let archDrawFull      = false;
let archArrow         = null;          // {x, y, vx, vy, angle, trail:[]}
let archArrowsInTarget = [];          // [{x, y, score}]
let archAimX          = 0;
let archAimY          = 0;
let archAimWobbleX    = 0;
let archAimWobbleY    = 0;
let archTargetPulse   = 0;
let archBowAngle      = 0;
let archTutSlide      = 0;
let archTutTimer      = null;
let archTutCompleted  = sessionStorage.getItem('arch_tut_done') === 'true';
let archLeaderboard   = JSON.parse(localStorage.getItem('arch_leaderboard') || '[]');
let archSecondHand    = null;          // raw landmarks for second hand

const ARCH_TUT_SLIDES    = 5;
const ARCH_TUT_DURATION  = 5500;

let archWindX = 0;
let archWindY = 0;
let archWindSpeed = 0;
let archTargetMoveSpeed = 0;
let archTargetMoveDir = 1;
let archWindParticles = [];

// Target position (canvas coords — appears on right side due to mirroring)
let archTargetCX, archTargetCY, archTargetSize;

function archSetTargetPos() {
    archTargetCX   = worldW * 0.22;
    archTargetCY   = worldH * 0.45;
    archTargetSize = Math.min(worldW, worldH) * 0.32;
    
    // Set wind for the round
    resetWind();
}

function resetWind() {
    const angle = Math.random() * Math.PI * 2;
    archWindSpeed = Math.random() * 2.5;
    archWindX = Math.cos(angle) * archWindSpeed;
    archWindY = Math.sin(angle) * archWindSpeed;
    
    const windEl = document.getElementById('archery-wind');
    if (windEl) {
        windEl.style.display = 'flex';
        document.getElementById('wind-arrow').style.transform = `rotate(${angle + Math.PI/2}rad)`;
        document.getElementById('wind-speed').textContent = `${(archWindSpeed * 5).toFixed(1)} MPH`;
    }
}

function archSetTargetPos() {
    archTargetCX   = worldW * 0.22;
    archTargetCY   = worldH * 0.45;
    archTargetSize = Math.min(worldW, worldH) * 0.32;
    resetWind();
}

function skipArcheryTutorial() {
    clearInterval(archTutTimer); archTutTimer = null;
    archTutCompleted = true;
    sessionStorage.setItem('arch_tut_done', 'true');
    hideOverlay(archTutOverlay);
    startArcheryCalibration();
}


// ═══════════════════════════════════════
//       ARCHERY CALIBRATION (2 HANDS)
// ═══════════════════════════════════════

function startArcheryCalibration() {
    gameState = 'archeryCal';
    showOverlay(archCalibOverlay);
    document.getElementById('arch-cal-status').textContent = 'SHOW BOTH HANDS 🖐️🖐️';
    document.getElementById('arch-cal-hand1').className = 'arch-cal-hand';
    document.getElementById('arch-cal-hand2').className = 'arch-cal-hand';
}

function archCalibrationCheck(numHands) {
    if (gameState !== 'archeryCal') return;
    const h1 = document.getElementById('arch-cal-hand1');
    const h2 = document.getElementById('arch-cal-hand2');
    const st = document.getElementById('arch-cal-status');

    if (numHands >= 1) h1.classList.add('detected');
    else h1.classList.remove('detected');
    if (numHands >= 2) h2.classList.add('detected');
    else h2.classList.remove('detected');

    if (numHands >= 2) {
        st.textContent = 'BOTH HANDS LOCKED! STARTING...';
        st.style.color = 'var(--primary)';
        setTimeout(() => {
            if (gameState === 'archeryCal') {
                hideOverlay(archCalibOverlay);
                startArcheryRound();
            }
        }, 1000);
    } else if (numHands === 1) {
        st.textContent = 'ONE HAND FOUND — SHOW YOUR OTHER HAND';
        st.style.color = 'var(--secondary)';
    } else {
        st.textContent = 'SHOW BOTH HANDS 🖐️🖐️';
        st.style.color = '';
    }
}


// ═══════════════════════════════════════
//          ARCHERY GAME ROUND
// ═══════════════════════════════════════

function startArcheryRound() {
    gameState = 'archeryPlaying';
    archState = 'aiming';
    archScore = 0;
    archShotNum = 0;
    archShotResults = [];
    archArrowsInTarget = [];
    archArrow = null;
    archBowHistory = [];
    archSetTargetPos();

    // Show archery HUD
    document.getElementById('archery-hud').style.display = 'flex';
    resetWind();
    updateArcheryHUD();
}

function updateArcheryHUD() {
    document.getElementById('arch-hud-shots').textContent = `${ARCH_MAX_SHOTS - archShotNum}`;
    document.getElementById('arch-hud-score').textContent = archScore;
    // Stability meter
    const stabPct = Math.round(archStability * 100);
    document.getElementById('arch-stability-fill').style.width = stabPct + '%';
    document.getElementById('arch-stability-fill').style.background =
        archStability > 0.7 ? 'var(--accent-gradient)' :
        archStability > 0.4 ? 'linear-gradient(90deg, #ffcc00, #ff6b35)' :
                              'linear-gradient(90deg, #ff0055, #ff3b5c)';
    document.getElementById('arch-stability-label').textContent =
        archStability > 0.85 ? 'ROCK STEADY' :
        archStability > 0.6  ? 'STEADY' :
        archStability > 0.35 ? 'SHAKY' : 'UNSTABLE!';
}


// ═══════════════════════════════════════
//        ARCHERY PROCESS TWO HANDS
// ═══════════════════════════════════════

function archeryProcessHands(results) {
    if (gameState !== 'archeryPlaying' && gameState !== 'archeryCal') return;

    const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;

    if (gameState === 'archeryCal') {
        archCalibrationCheck(numHands);
        return;
    }

    if (numHands < 2) {
        archBowHand = null;
        archDrawHand = null;
        return;
    }

    // Identify bow hand (higher x in canvas = user's left hand visually on left)
    // and draw hand (lower x = user's right hand visually on right)
    const lm0 = results.multiHandLandmarks[0];
    const lm1 = results.multiHandLandmarks[1];
    const cx0 = (lm0[0].x + lm0[5].x + lm0[17].x) / 3 * worldW;
    const cy0 = (lm0[0].y + lm0[5].y + lm0[17].y) / 3 * worldH;
    const cx1 = (lm1[0].x + lm1[5].x + lm1[17].x) / 3 * worldW;
    const cy1 = (lm1[0].y + lm1[5].y + lm1[17].y) / 3 * worldH;

    // Bow hand = the hand further from the target (higher x since target is at low x)
    if (cx0 > cx1) {
        archBowHand  = { x: cx0, y: cy0, lm: lm0 };
        archDrawHand = { x: cx1, y: cy1, lm: lm1 };
    } else {
        archBowHand  = { x: cx1, y: cy1, lm: lm1 };
        archDrawHand = { x: cx0, y: cy0, lm: lm0 };
    }

    // Track bow hand stability
    archBowHistory.push({ x: archBowHand.x, y: archBowHand.y });
    if (archBowHistory.length > ARCH_STABILITY_FRAMES) archBowHistory.shift();

    if (archBowHistory.length >= 5) {
        let totalMovement = 0;
        for (let i = 1; i < archBowHistory.length; i++) {
            const dx = archBowHistory[i].x - archBowHistory[i-1].x;
            const dy = archBowHistory[i].y - archBowHistory[i-1].y;
            totalMovement += Math.sqrt(dx*dx + dy*dy);
        }
        const avgMovement = totalMovement / archBowHistory.length;
        archStability = Math.max(0, Math.min(1, 1 - avgMovement / 18));
    }

    // Calculate draw distance
    archPrevDrawDist = archDrawDist;
    archDrawDist = Math.sqrt((archBowHand.x - archDrawHand.x)**2 + (archBowHand.y - archDrawHand.y)**2);
    archDrawFull = archDrawDist > ARCH_DRAW_THRESHOLD;

    // Bow angle
    archBowAngle = Math.atan2(archBowHand.y - archDrawHand.y, archBowHand.x - archDrawHand.x);

    // Aim point on target (mapped from bow hand position)
    const aimRawX = ((archBowHand.x / worldW) - 0.5) * 2;
    const aimRawY = ((archBowHand.y / worldH) - 0.5) * 2;
    const wobbleAmount = (1 - archStability) * archTargetSize * 0.4;
    archAimWobbleX = (Math.random() - 0.5) * wobbleAmount;
    archAimWobbleY = (Math.random() - 0.5) * wobbleAmount;
    archAimX = archTargetCX + aimRawX * archTargetSize * 0.3 + archAimWobbleX;
    archAimY = archTargetCY + aimRawY * archTargetSize * 0.5 + archAimWobbleY;
}


// ═══════════════════════════════════════
//          ARCHERY UPDATE (PHYSICS)
// ═══════════════════════════════════════

function archeryUpdate() {
    if (gameState !== 'archeryPlaying') return;
    archTargetPulse += 0.03;
    updateArcheryHUD();

    // Update Wind Particles
    if (Math.random() < 0.15) {
        archWindParticles.push({
            x: archWindX > 0 ? -20 : worldW + 20,
            y: Math.random() * worldH,
            vx: archWindX * 3 + (Math.random() - 0.5) * 2,
            vy: archWindY * 3 + (Math.random() - 0.5) * 1,
            life: 1
        });
    }
    archWindParticles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.01;
    });
    archWindParticles = archWindParticles.filter(p => p.life > 0 && p.x > -50 && p.x < worldW + 50);

    // Moving Target Logic
    if (archShotNum >= 2 && archState !== 'scored') {
        const speedScale = archShotNum >= 4 ? 2.5 : 1.2;
        archTargetCY += archTargetMoveDir * speedScale;
        if (archTargetCY > worldH * 0.7 || archTargetCY < worldH * 0.2) {
            archTargetMoveDir *= -1;
        }
    }

    if (archState === 'aiming' || archState === 'drawing') {
        if (!archBowHand || !archDrawHand) return;

        if (archDrawFull) {
            archState = 'drawing';

            // Detect release: draw distance drops suddenly
            if (archPrevDrawDist > ARCH_DRAW_THRESHOLD && archDrawDist < archPrevDrawDist - ARCH_RELEASE_SPEED) {
                fireArcheryArrow();
            }
        } else {
            archState = 'aiming';
        }
    }

    if (archState === 'fired' && archArrow) {
        archArrow.x += archArrow.vx;
        archArrow.y += archArrow.vy;
        
        // Apply Wind
        archArrow.vx += archWindX * 0.05;
        archArrow.vy += archWindY * 0.05;
        
        archArrow.trail.push({ x: archArrow.x, y: archArrow.y, life: 1 });
        if (archArrow.trail.length > 25) archArrow.trail.shift();
        archArrow.trail.forEach(t => t.life -= 0.04);

        // Check if arrow reached target area
        const dx = archArrow.x - archTargetCX;
        const dy = archArrow.y - archTargetCY;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < archTargetSize * 0.45 || archArrow.x < archTargetCX + archTargetSize * 0.45) {
            // Arrow has reached or passed target — score it
            scoreArcheryShot(archArrow.x, archArrow.y);
        }

        // If arrow goes off-screen entirely = miss
        if (archArrow.x < -50 || archArrow.x > worldW + 50 || archArrow.y < -50 || archArrow.y > worldH + 50) {
            scoreArcheryShot(archArrow.x, archArrow.y);
        }
    }
}

function fireArcheryArrow() {
    if (archShotNum >= ARCH_MAX_SHOTS) return;
    archState = 'fired';

    // Arrow destination = current aim point with stability-based deviation
    const deviation = (1 - archStability) * archTargetSize * 0.5;
    const destX = archAimX + (Math.random() - 0.5) * deviation;
    const destY = archAimY + (Math.random() - 0.5) * deviation;

    const startX = archBowHand.x;
    const startY = archBowHand.y;
    const angle = Math.atan2(destY - startY, destX - startX);

    archArrow = {
        x: startX, y: startY,
        vx: Math.cos(angle) * ARCH_ARROW_SPEED,
        vy: Math.sin(angle) * ARCH_ARROW_SPEED,
        angle: angle,
        trail: []
    };

    archBowHistory = []; // Reset stability for next shot
}

function scoreArcheryShot(arrowX, arrowY) {
    archState = 'scored';
    const dx = arrowX - archTargetCX;
    const dy = arrowY - archTargetCY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    let shotScore = 0;
    for (const ring of ARCH_TARGET_RINGS) {
        if (dist < ring.radius * archTargetSize * 2.2) {
            shotScore = ring.score;
            break;
        }
    }

    // If completely outside all rings
    if (dist > ARCH_TARGET_RINGS[ARCH_TARGET_RINGS.length - 1].radius * archTargetSize * 2.2) {
        shotScore = 0;
    }

    archArrowsInTarget.push({ x: arrowX, y: arrowY, score: shotScore });
    archShotResults.push(shotScore);
    archScore += shotScore;
    archShotNum++;

    // Show shot popup
    showArcheryShotPopup(shotScore);

    setTimeout(() => {
        archShotPopup.style.display = 'none';
        archArrow = null;
        if (archShotNum >= ARCH_MAX_SHOTS) {
            endArcheryRound();
        } else {
            resetWind(); // New wind for each shot
            archState = 'aiming';
            archDrawDist = 0;
            archPrevDrawDist = 0;
        }
    }, 1500);
}

function showArcheryShotPopup(score) {
    const el = archShotPopup;
    let emoji, label, cls;
    if (score === 10) { emoji = '🎯'; label = 'BULLSEYE!'; cls = 'bullseye'; }
    else if (score >= 8) { emoji = '🔥'; label = 'GREAT SHOT!'; cls = 'great'; }
    else if (score >= 5) { emoji = '👍'; label = 'NICE'; cls = 'nice'; }
    else if (score >= 1) { emoji = '😬'; label = 'CLOSE'; cls = 'close'; }
    else { emoji = '💨'; label = 'MISS!'; cls = 'miss'; }

    document.getElementById('arch-shot-emoji').textContent = emoji;
    document.getElementById('arch-shot-label').textContent = label;
    document.getElementById('arch-shot-score').textContent = score > 0 ? `+${score}` : '0';
    document.getElementById('arch-shot-score').className = 'arch-shot-score ' + cls;
    document.getElementById('arch-shot-num').textContent = `Shot ${archShotNum} of ${ARCH_MAX_SHOTS}`;

    el.style.display = 'flex';
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = 'fadeIn 0.3s ease';
}


// ═══════════════════════════════════════
//         ARCHERY ROUND END
// ═══════════════════════════════════════

function endArcheryRound() {
    archState = 'ended';
    document.getElementById('archery-hud').style.display = 'none';

    // Save to leaderboard
    archLeaderboard.push({ name: playerName, score: archScore, date: new Date().toISOString() });
    archLeaderboard.sort((a, b) => b.score - a.score);
    localStorage.setItem('arch_leaderboard', JSON.stringify(archLeaderboard));

    // Store in session results
    if (typeof groupSessionResults !== 'undefined') {
        groupSessionResults.push({ name: playerName, score: archScore });
    }

    // Unified leaderboard update
    if (typeof switchLB === 'function') {
        switchLB('archery');
    }
    
    document.getElementById('archery-wind').style.display = 'none';

    // Build end screen
    const shotBreakdown = archShotResults.map((s, i) => {
        const cls = s >= 10 ? 'bullseye' : s >= 8 ? 'great' : s >= 5 ? 'nice' : s >= 1 ? 'close' : 'miss';
        return `<div class="arch-shot-entry ${cls}"><span>Shot ${i+1}</span><span>+${s}</span></div>`;
    }).join('');

    document.getElementById('arch-end-name').textContent = playerName;
    document.getElementById('arch-end-total').textContent = archScore;
    document.getElementById('arch-end-max').textContent = ` / ${ARCH_MAX_SHOTS * 10}`;
    document.getElementById('arch-end-breakdown').innerHTML = shotBreakdown;

    showOverlay(archEndOverlay);
}

function archeryNextStudent() {
    hideOverlay(archEndOverlay);
    if (typeof handleNextTurn === 'function') {
        handleNextTurn();
    } else {
        gameState = 'welcome';
        selectedGame = null;
        showOverlay(welcomeOverlay);
    }
}

function endArcheryTournament() {
    hideOverlay(archEndOverlay);
    gameState = 'results';

    // Show the results overlay with archery leaderboard
    if (archLeaderboard.length > 0) {
        const w = archLeaderboard[0];
        winnerAnnounce.innerHTML = `
            <div style="font-family:var(--font-mono);font-size:0.5rem;color:var(--text-dim);letter-spacing:2px;margin-bottom:0.3rem;">🏆 SHARP SHOOTER CHAMPION</div>
            <div class="winner-name">${w.name}</div>
            <div class="winner-score">${w.score} / ${ARCH_MAX_SHOTS * 10}</div>
            <div style="margin-top:0.8rem;">
                <span class="arch-title-badge">🧠 CONTROLLED MIND</span>
                <span class="arch-title-badge">🎯 SHARP SHOOTER</span>
            </div>
        `;
        finalLeaderboard.innerHTML = archLeaderboard.slice(0, 10).map((e, i) => `
            <div class="final-entry ${i === 0 ? 'gold' : ''}">
                <span class="final-rank">${(i + 1).toString().padStart(2, '0')}</span>
                <span class="final-name">${e.name}</span>
                <span class="final-score">${e.score}/${ARCH_MAX_SHOTS * 10}</span>
            </div>
        `).join('');
    } else {
        winnerAnnounce.innerHTML = '<p>No archers competed.</p>';
        finalLeaderboard.innerHTML = '';
    }

    showOverlay(resultsOverlay);
    launchArcheryCelebration();
}

function launchArcheryCelebration() {
    // Create confetti + archery-themed celebration particles
    const celebContainer = document.createElement('div');
    celebContainer.id = 'archery-celebration';
    celebContainer.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;';
    document.body.appendChild(celebContainer);

    const emojis = ['🎯','🏹','⭐','🔥','🥇','💎','👑','✨'];
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        p.style.cssText = `
            position:absolute;
            left:${Math.random()*100}%;
            top:-40px;
            font-size:${16 + Math.random()*24}px;
            animation: archConfettiFall ${2.5 + Math.random()*3}s linear ${Math.random()*2}s forwards;
            opacity:0.9;
        `;
        celebContainer.appendChild(p);
    }

    setTimeout(() => celebContainer.remove(), 7000);
}


// ═══════════════════════════════════════
//          ARCHERY RENDERING
// ═══════════════════════════════════════

function archeryRender() {
    if (gameState !== 'archeryPlaying') return;

    // 0. Draw wind particles
    ctx.save();
    archWindParticles.forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4);
        ctx.strokeStyle = `rgba(255,255,255,${p.life * 0.15})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    });
    ctx.restore();

    // 1. Draw target board
    drawArcheryTarget();

    // 2. Draw arrows already in target
    archArrowsInTarget.forEach(a => drawArrowInTarget(a));

    // 3. Draw bow and arrow if hands visible
    if (archBowHand && archDrawHand) {
        drawBow();
        drawAimCrosshair();
        drawHandDots(archBowHand.lm, '#00ff88');
        drawHandDots(archDrawHand.lm, '#00bdff');
    } else {
        // Show "show both hands" message
        ctx.save();
        ctx.font = '600 22px Inter'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('🖐️ Show BOTH hands to aim 🖐️', worldW / 2, worldH / 2);
        ctx.restore();
    }

    // 4. Draw arrow in flight
    if (archState === 'fired' && archArrow) {
        drawFlyingArrow();
    }

    // 5. Draw stability visual near bow
    if (archBowHand && archState !== 'fired') {
        drawStabilityRing();
    }
}

function drawArcheryTarget() {
    ctx.save();
    const cx = archTargetCX, cy = archTargetCY;
    const pulse = 1 + Math.sin(archTargetPulse) * 0.008;

    // Shadow/glow behind target
    ctx.shadowBlur = 40;
    ctx.shadowColor = 'rgba(255,215,0,0.3)';

    // Draw rings from outside to inside
    for (let i = ARCH_TARGET_RINGS.length - 1; i >= 0; i--) {
        const ring = ARCH_TARGET_RINGS[i];
        const r = ring.radius * archTargetSize * 2.2 * pulse;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = ring.color + '33';
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Score label
        ctx.font = '600 11px Inter';
        ctx.textAlign = 'center';
        ctx.fillStyle = ring.color;
        ctx.fillText(ring.score, cx, cy - r + 13);
    }

    // Center bullseye dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.shadowBlur = 20; ctx.shadowColor = '#FFD700';
    ctx.fill();

    // Crosshair lines
    const outerR = ARCH_TARGET_RINGS[ARCH_TARGET_RINGS.length - 1].radius * archTargetSize * 2.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - outerR, cy); ctx.lineTo(cx + outerR, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - outerR); ctx.lineTo(cx, cy + outerR); ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawBow() {
    if (!archBowHand || !archDrawHand) return;
    ctx.save();

    const bx = archBowHand.x, by = archBowHand.y;
    const dx = archDrawHand.x, dy = archDrawHand.y;

    // Bow body (arc)
    const bowLen = 110;
    const bowAngle = archBowAngle;
    const perpAngle = bowAngle + Math.PI / 2;

    const topX = bx + Math.cos(perpAngle) * bowLen / 2;
    const topY = by + Math.sin(perpAngle) * bowLen / 2;
    const botX = bx - Math.cos(perpAngle) * bowLen / 2;
    const botY = by - Math.sin(perpAngle) * bowLen / 2;

    // Curved bow limb
    const curveOffset = 30;
    const curveCX = bx + Math.cos(bowAngle) * curveOffset;
    const curveCY = by + Math.sin(bowAngle) * curveOffset;

    // Bow limbs (upper and lower)
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(139,69,19,0.5)';

    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(curveCX, curveCY, botX, botY);
    ctx.stroke();

    // Wood grain gradient overlay
    ctx.strokeStyle = '#A0522D';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(curveCX, curveCY, botX, botY);
    ctx.stroke();

    // Bowstring
    const drawPull = Math.min(1, archDrawDist / ARCH_DRAW_THRESHOLD);
    const stringMidX = bx + (dx - bx) * drawPull * 0.6;
    const stringMidY = by + (dy - by) * drawPull * 0.6;

    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(255,255,255,0.3)';

    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(stringMidX, stringMidY);
    ctx.lineTo(botX, botY);
    ctx.stroke();

    // Arrow on the bow (when drawing)
    if (archState === 'aiming' || archState === 'drawing') {
        const arrowTipX = bx + Math.cos(bowAngle) * 50;
        const arrowTipY = by + Math.sin(bowAngle) * 50;
        const arrowEndX = stringMidX;
        const arrowEndY = stringMidY;

        // Arrow shaft
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(arrowTipX, arrowTipY);
        ctx.lineTo(arrowEndX, arrowEndY);
        ctx.stroke();

        // Arrowhead
        const headLen = 10;
        ctx.fillStyle = '#ff3b5c';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ff3b5c';
        ctx.beginPath();
        ctx.moveTo(arrowTipX + Math.cos(bowAngle) * headLen, arrowTipY + Math.sin(bowAngle) * headLen);
        ctx.lineTo(arrowTipX + Math.cos(bowAngle + 2.5) * headLen * 0.6, arrowTipY + Math.sin(bowAngle + 2.5) * headLen * 0.6);
        ctx.lineTo(arrowTipX + Math.cos(bowAngle - 2.5) * headLen * 0.6, arrowTipY + Math.sin(bowAngle - 2.5) * headLen * 0.6);
        ctx.closePath();
        ctx.fill();

        // Fletching
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1;
        for (let f = 0; f < 3; f++) {
            const fx = arrowEndX - Math.cos(bowAngle) * (f * 5 + 2);
            const fy = arrowEndY - Math.sin(bowAngle) * (f * 5 + 2);
            const fa = bowAngle + Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(fx + Math.cos(fa) * 5, fy + Math.sin(fa) * 5);
            ctx.lineTo(fx - Math.cos(fa) * 5, fy - Math.sin(fa) * 5);
            ctx.stroke();
        }

        // Draw power indicator
        if (archDrawFull) {
            ctx.fillStyle = 'rgba(0,255,136,0.8)';
            ctx.font = '700 14px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('RELEASE TO FIRE! 🏹', bx, by - 70);
        } else {
            const pct = Math.round(drawPull * 100);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '600 12px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(`Draw: ${pct}%`, bx, by - 60);
        }
    }

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawAimCrosshair() {
    if (archState === 'fired' || archState === 'scored') return;
    ctx.save();

    const ax = archAimX, ay = archAimY;
    const s = 15 + (1 - archStability) * 20;

    // Outer crosshair
    ctx.strokeStyle = archStability > 0.6 ? 'rgba(0,255,136,0.7)' : 'rgba(255,59,92,0.7)';
    ctx.lineWidth = 1.5;

    ctx.beginPath(); ctx.moveTo(ax - s, ay); ctx.lineTo(ax - s * 0.3, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax + s * 0.3, ay); ctx.lineTo(ax + s, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax, ay - s); ctx.lineTo(ax, ay - s * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax, ay + s * 0.3); ctx.lineTo(ax, ay + s); ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    ctx.fillStyle = archStability > 0.6 ? '#00ff88' : '#ff3b5c';
    ctx.shadowBlur = 10;
    ctx.shadowColor = archStability > 0.6 ? '#00ff88' : '#ff3b5c';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawFlyingArrow() {
    ctx.save();
    const a = archArrow;

    // Trail effect
    a.trail.forEach(t => {
        if (t.life > 0) {
            ctx.beginPath();
            ctx.arc(t.x, t.y, 2 * t.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,200,100,${t.life * 0.5})`;
            ctx.fill();
        }
    });

    // Arrow shaft
    const len = 40;
    const endX = a.x - Math.cos(a.angle) * len;
    const endY = a.y - Math.sin(a.angle) * len;

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
    const headLen = 10;
    ctx.fillStyle = '#ff3b5c';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff3b5c';
    ctx.beginPath();
    ctx.moveTo(a.x + Math.cos(a.angle) * headLen, a.y + Math.sin(a.angle) * headLen);
    ctx.lineTo(a.x + Math.cos(a.angle + 2.5) * headLen * 0.5, a.y + Math.sin(a.angle + 2.5) * headLen * 0.5);
    ctx.lineTo(a.x + Math.cos(a.angle - 2.5) * headLen * 0.5, a.y + Math.sin(a.angle - 2.5) * headLen * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawArrowInTarget(arrow) {
    ctx.save();
    const ax = arrow.x, ay = arrow.y;

    // Small arrow stuck in target
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + 20, ay);
    ctx.stroke();

    // Fletching
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax + 18, ay - 4);
    ctx.lineTo(ax + 18, ay + 4);
    ctx.stroke();

    // Score label
    ctx.font = '700 10px Inter';
    ctx.textAlign = 'center';
    ctx.fillStyle = arrow.score >= 8 ? '#FFD700' : arrow.score >= 5 ? '#00BDFF' : '#ff3b5c';
    ctx.fillText(arrow.score, ax + 10, ay - 8);

    ctx.restore();
}

function drawStabilityRing() {
    if (!archBowHand) return;
    ctx.save();

    const bx = archBowHand.x, by = archBowHand.y;
    const outerR = 55 + (1 - archStability) * 30;
    const progress = archStability;

    ctx.strokeStyle = archStability > 0.7 ? 'rgba(0,255,136,0.3)' : archStability > 0.4 ? 'rgba(255,204,0,0.3)' : 'rgba(255,0,85,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(bx, by, outerR, 0, Math.PI * 2);
    ctx.stroke();

    // Progress arc (how stable)
    ctx.setLineDash([]);
    ctx.strokeStyle = archStability > 0.7 ? '#00ff88' : archStability > 0.4 ? '#ffcc00' : '#ff0055';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by, outerR - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();

    ctx.restore();
}

function drawHandDots(landmarks, color) {
    if (!landmarks) return;
    ctx.save();
    for (let i = 0; i < landmarks.length; i++) {
        const lx = landmarks[i].x * worldW;
        const ly = landmarks[i].y * worldH;
        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.fill();
    }

    // Connection lines
    const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20],[0,17]
    ];
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = 1;
    connections.forEach(([a,b]) => {
        ctx.beginPath();
        ctx.moveTo(landmarks[a].x * worldW, landmarks[a].y * worldH);
        ctx.lineTo(landmarks[b].x * worldW, landmarks[b].y * worldH);
        ctx.stroke();
    });
    ctx.shadowBlur = 0;
    ctx.restore();
}


// ═══════════════════════════════════════
//          ARCHERY EVENT LISTENERS
// ═══════════════════════════════════════

document.getElementById('btn-skip-arch-tut').addEventListener('click', skipArcheryTutorial);
document.getElementById('btn-arch-next').addEventListener('click', archeryNextStudent);
document.getElementById('btn-arch-end-tourn').addEventListener('click', endArcheryTournament);
