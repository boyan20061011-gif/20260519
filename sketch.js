'use strict';

// ─────────────────────────────────────────────────────────────
// 1. 配置與常數
// ─────────────────────────────────────────────────────────────
const W = 640, H = 480;
const PICKS = ['rock', 'paper', 'scissors'];
const EM = { rock: '✊', paper: '🖐', scissors: '✌️' };
const LB = { rock: '石頭', paper: '布', scissors: '剪刀' };
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const PAL = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#C3A6FF', '#FF9F43', '#56CCF2', '#FD79A8', '#A3F7BF'];
const SKEL = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

let capture, hands, camera;
let st = 'loading', stAt = Date.now();
let pG = null, cG = null, lm = null, stable = null;
let gBuf = [], holdT = null, wBuf = [];
let score = { w: 0, l: 0, d: 0 };
let parts = [], fwI = null, maskP = 0;
let mx = 0, my = 0; // 虛擬滑鼠座標

const BUF = 14, HOLD = 2000, CD = 3; // HOLD 2000ms 即為 2 秒

const enter = s => { st = s; stAt = Date.now(); };

// ─────────────────────────────────────────────────────────────
// 2. p5.js 核心
// ─────────────────────────────────────────────────────────────
function setup() {
  createCanvas(windowWidth, windowHeight);
  
  // 初始化擷取
  capture = createCapture(VIDEO);
  capture.size(W, H);
  capture.hide();

  // 初始化 MediaPipe Hands
  hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.72, minTrackingConfidence: 0.5 });
  hands.onResults(onResults);

  // 啟動相機循環
  camera = new Camera(capture.elt, {
    onFrame: async () => { await hands.send({ image: capture.elt }); },
    width: W, height: H
  });
  camera.start().then(() => { if (st === 'loading') enter('idle'); });
}

function draw() {
  background('#e7c6ff');
  const now = Date.now();
  update(now);

  // 計算 50% 置中比例
  let displayW = width * 0.5;
  let displayH = height * 0.5;
  let scaleFactor = Math.min(displayW / W, displayH / H);
  
  // 計算虛擬滑鼠座標以進行按鈕判定
  mx = (mouseX - width / 2) / scaleFactor + W / 2;
  my = (mouseY - height / 2) / scaleFactor + H / 2;

  push();
  // 置中並縮放
  translate(width / 2, height / 2);
  scale(scaleFactor);
  translate(-W / 2, -H / 2);

  const g = drawingContext; // 取得原生 CanvasContext 以執行複雜繪圖

  // 繪製背景影像 (鏡像)
  if (st !== 'loading' && st !== 'ended') {
    push();
    translate(W, 0);
    scale(-1, 1);
    image(capture, 0, 0, W, H);
    pop();
  }

  // 狀態渲染器
  const render = {
    loading: () => dLoading(g),
    idle: () => dIdle(g),
    countdown: () => dCountdown(g),
    reveal: () => dReveal(g),
    win: () => dWin(g),
    lose: () => dLose(g),
    draw: () => dDraw(g),
    menu: () => dMenu(g),
    ended: () => dEnded(g)
  };
  (render[st] || render.loading)();

  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function mousePressed() {
  if (st !== 'menu') return;
  const bw = 132, bh = 52, by = H / 2 + 24;
  if (mx >= W/2-bw-8 && mx <= W/2-8 && my >= by && my <= by+bh) startGame();
  if (mx >= W/2+8 && mx <= W/2+140 && my >= by && my <= by+bh) enter('ended');
}

// ─────────────────────────────────────────────────────────────
// 3. 邏輯處理 (辨識、更新、判定)
// ─────────────────────────────────────────────────────────────
function onResults(r) {
  if (r.multiHandLandmarks && r.multiHandLandmarks[0]) {
    lm = r.multiHandLandmarks[0];
    const gest = classify(lm);
    gBuf.push(gest); if (gBuf.length > BUF) gBuf.shift();
    stable = vote(gBuf);
  } else {
    lm = null; stable = null; gBuf = [];
  }
}

function classify(l) {
  const tips = [8, 12, 16, 20], pips = [6, 10, 14, 18];
  const ext = tips.map((t, i) => l[t].y < l[pips[i]].y);
  const n = ext.filter(Boolean).length;
  if (n === 0) return 'rock';
  if (n >= 3) return 'paper';
  if (ext[0] && ext[1] && !ext[2] && !ext[3]) return 'scissors';
  return 'unknown';
}

function vote(buf) {
  if (buf.length < 6) return null;
  const c = {}; buf.forEach(v => { c[v] = (c[v] || 0) + 1; });
  let b = null, bn = 0;
  for (const v in c) if (v !== 'unknown' && c[v] > bn) { bn = c[v]; b = v; }
  return bn / buf.length >= .55 ? b : null;
}

function update(now) {
  const el = now - stAt;
  // 粒子更新
  parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .18; p.vx *= .97; p.life -= p.dec; });
  parts = parts.filter(p => p.life > 0);

  if (st === 'idle') {
    // 待機狀態：偵測到「布 (🖐️)」開始計時
    if (stable === 'paper') { 
      if (pG !== stable) { holdT = now; pG = stable; }
      if (holdT && now - holdT >= HOLD) enter('countdown');
    } else { holdT = null; pG = null; }
  }

  if (st === 'countdown') {
    if (stable && stable !== 'unknown') pG = stable;
    if (el >= CD * 1000) {
      if (!pG) pG = PICKS[Math.random() * 3 | 0];
      cG = PICKS[Math.random() * 3 | 0];
      enter('reveal');
    }
  }

  if (st === 'reveal' && el > 1500) {
    const res = pG === cG ? 'draw' : BEATS[pG] === cG ? 'win' : 'lose';
    if (res === 'win') { score.w++; startFW(); }
    else if (res === 'lose') score.l++;
    else score.d++;
    enter(res);
  }

  if (st === 'win' && el > 4800) { stopFW(); enter('menu'); }
  if (st === 'lose' && el > 3800) enter('menu');
  if (st === 'draw' && el > 2800) enter('menu');

  if (st === 'menu') {
    // 選單狀態：偵測到「布 (🖐️)」繼續遊戲，偵測到「石頭 (✊)」結束遊戲
    if (stable === 'paper' || stable === 'rock') { 
      if (pG !== stable) { holdT = now; pG = stable; }
      if (holdT && now - holdT >= HOLD) {
        if (stable === 'paper') startGame();
        else enter('ended');
      }
    } else { holdT = null; pG = null; }
  }
}

function startGame() {
  parts = []; gBuf = []; stable = null; holdT = null; pG = null; cG = null;
  stopFW(); enter('idle');
}

// ─────────────────────────────────────────────────────────────
// 4. 繪圖輔助工具 (移植自 HTML)
// ─────────────────────────────────────────────────────────────
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function boldT(g, t, x, y, fs, col, stroke, shadow) {
  g.save(); g.font = `bold ${fs}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (shadow) { g.shadowColor = shadow; g.shadowBlur = 28; }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 4; g.strokeText(t, x, y); }
  g.fillStyle = col || '#FFF'; g.fillText(t, x, y); g.restore();
}

function smT(g, t, x, y, fs, col) {
  g.save(); g.font = `${fs}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = col || 'rgba(255,255,255,.6)'; g.fillText(t, x, y); g.restore();
}

function scoreHUD(g) {
  g.save();
  const sw = 192, sh = 34, sx = W - sw - 8, sy = 8;
  g.fillStyle = 'rgba(0,0,0,.58)'; rr(g, sx, sy, sw, sh, 8); g.fill();
  g.font = 'bold 13px Arial'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = '#00FF88'; g.fillText(`✅ ${score.w}勝`, sx + 10, sy + sh / 2);
  g.fillStyle = '#FF6B6B'; g.fillText(`❌ ${score.l}敗`, sx + 72, sy + sh / 2);
  g.fillStyle = '#FFD93D'; g.fillText(`🤝 ${score.d}平`, sx + 138, sy + sh / 2);
  g.restore();
}

function dLoading(g) {
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
  boldT(g, '載入 AI 手勢辨識中…', W / 2, H / 2 - 24, 26, '#FFF', null, '#4ECDC4');
  smT(g, '🖐️ 張開手掌 2 秒以開始遊戲', W / 2, H / 2 + 30, 16, 'rgba(255,255,255,0.5)');
}

function dIdle(g) {
  scoreHUD(g);
  const gr = g.createLinearGradient(0, H - 148, 0, H);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.9)');
  g.fillStyle = gr; g.fillRect(0, H - 148, W, 148);

  if (!lm) {
    boldT(g, '請將手伸入畫面', W / 2, H - 90, 22, '#FFF');
    smT(g, '比出 🖐️ 張開手掌 (布) 靜止 2 秒以開始遊戲', W / 2, H - 56, 15);
  } else if (stable) {
    boldT(g, `偵測到：${EM[stable]} ${LB[stable]}`, W / 2, H - 102, 20, '#00FF88', null, '#00FF88');
    const pct = holdT ? Math.min(1, (Date.now() - holdT) / HOLD) : 0;
    g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, W / 2 - 104, H - 70, 208, 13, 6); g.fill();
    g.fillStyle = pct < .9 ? '#FFD93D' : '#00FF88';
    rr(g, W / 2 - 104, H - 70, 208 * pct, 13, 6); g.fill();
  }
}

function dCountdown(g) {
  const el = Date.now() - stAt;
  const sc = Math.ceil((CD * 1000 - el) / 1000);
  const col = sc === 1 ? '#FF4444' : '#00FF88';
  boldT(g, sc, W / 2, H / 2, 118, col, null, col);
}

function dReveal(g) {
  const el = Date.now() - stAt;
  const cpuA = Math.min(1, Math.max(0, (el - 400) / 500));
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, 0, W, H);
  card(g, pG, 42, H / 2 - 72, W / 2 - 82, 144, '#4488FF', 1);
  card(g, cG, W / 2 + 40, H / 2 - 72, W / 2 - 82, 144, '#FF4444', cpuA);
}

function card(g, gest, x, y, w, h, acc, a) {
  g.save(); g.globalAlpha = a;
  g.fillStyle = acc + '22'; g.strokeStyle = acc; g.lineWidth = 2;
  rr(g, x, y, w, h, 14); g.fill(); g.stroke();
  g.font = `${h * .44}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFF';
  g.fillText(EM[gest] || '❓', x + w / 2, y + h * .46);
  g.restore();
}

function dWin(g) {
  parts.forEach(p => {
    g.save(); g.globalAlpha = p.life; g.fillStyle = p.col;
    g.beginPath(); g.arc(p.x, p.y, p.sz * p.life, 0, Math.PI * 2); g.fill(); g.restore();
  });
  scoreHUD(g);
  boldT(g, '🎉 恭喜你贏了！🎉', W / 2, 44, 44, '#FFD700', '#FF6600', '#FFD700');
}

function dLose(g) {
  scoreHUD(g);
  boldT(g, '😢 你輸了！', W / 2, 44, 44, '#FF2222', '#000', '#FF2222');
}

function dDraw(g) {
  scoreHUD(g);
  boldT(g, '🤝 平局！', W / 2, 44, 42, '#FFD93D', '#000', '#FFD93D');
}

function dMenu(g) {
  g.fillStyle = 'rgba(0,0,0,.78)'; g.fillRect(0, 0, W, H);
  boldT(g, '再玩一局？', W / 2, H / 2 - 78, 34, '#FFF');
  const bw = 132, bh = 52, by = H / 2 + 24;
  btn(g, '👈 繼續', W / 2 - bw - 8, by, bw, bh, '#00AA44');
  btn(g, '結束 👉', W / 2 + 8, by, bw, bh, '#CC2200');

  if (stable === 'paper' || stable === 'rock') {
    const pct = holdT ? Math.min(1, (Date.now() - holdT) / HOLD) : 0;
    g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, W / 2 - 104, H / 2 + 128, 208, 10, 5); g.fill();
    g.fillStyle = stable === 'paper' ? '#00FF88' : '#FF4444';
    rr(g, W / 2 - 104, H / 2 + 128, 208 * pct, 10, 5); g.fill();
  }
}

function btn(g, lbl, x, y, w, h, bg) {
  const hov = mx >= x && mx <= x + w && my >= y && my <= y + h;
  g.save(); g.fillStyle = hov ? '#FFF' : bg; rr(g, x, y, w, h, h / 2); g.fill();
  g.font = `bold ${h * .38}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = hov ? bg : '#FFF'; g.fillText(lbl, x + w / 2, y + h / 2); g.restore();
}

function dEnded(g) {
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
  boldT(g, '感謝遊玩！', W / 2, H / 2, 48, '#FFF');
}

function startFW() {
  fwI = setInterval(() => {
    const col = PAL[Math.random() * PAL.length | 0];
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 8 + 1;
      parts.push({ x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, dec: 0.02, sz: 5, col });
    }
  }, 500);
}

function stopFW() { if (fwI) clearInterval(fwI); fwI = null; }