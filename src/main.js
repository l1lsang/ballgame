import { connectArena, publishPlayer } from './firebase.js';

const TAU = Math.PI * 2;
const WORLD = 4200;
const FOOD_COUNT = 270;
const BOT_COUNT = 22;
const COLORS = ['#7c5cff', '#ff5b8d', '#31d6c7', '#ff9e44', '#5c8cff', '#e964ff', '#77dd67'];
const BOT_NAMES = ['몽글이', '탱탱볼', '동글왕', '말캉이', '포도알', '핫도그', '찹쌀떡', '방울이', '구르미', '콩콩이', '푸딩', '와사비', '삐약콩', '도토리', '별사탕', '물방울', '폭신이', '귤볼', '눈덩이', '젤리킹', '토실이', '꼬물이'];

const $ = (selector) => document.querySelector(selector);
const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
const mini = $('#minimap');
const mctx = mini.getContext('2d');

const ui = {
  start: $('#start-screen'),
  form: $('#start-form'),
  nickname: $('#nickname'),
  hud: $('#player-hud'),
  leaderboard: $('#leaderboard'),
  leaderboardList: $('#leaderboard-list'),
  minimap: $('#minimap-wrap'),
  controls: $('#controls-hint'),
  level: $('#level-value'),
  xpText: $('#xp-text'),
  xpFill: $('#xp-fill'),
  playerName: $('#player-name-label'),
  death: $('#death-screen'),
  eater: $('#eater-name'),
  respawnCount: $('#respawn-count'),
  status: $('#server-status'),
  toast: $('#toast'),
  stick: $('#mobile-stick'),
  sound: $('#sound-button'),
};

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const levelRadius = (level) => 22 + Math.sqrt(Math.max(0, level - 1)) * 10;
const xpGoal = (level) => 5 + level * 3;

let width = 0;
let height = 0;
let dpr = 1;
let running = false;
let lastTime = 0;
let animationId = 0;
let playerName = '말랑이';
let audioOn = true;
let audioContext = null;
let remotePlayers = {};
let foods = [];
let bots = [];
let particles = [];
let ripples = [];
let warnings = [];
let camera = { x: WORLD / 2, y: WORLD / 2, zoom: 1 };
let pointer = { x: 0, y: 0, active: false };
let keys = new Set();
let touchStart = null;

const player = {
  id: 'me', name: playerName, x: WORLD / 2, y: WORLD / 2,
  vx: 0, vy: 0, level: 1, xp: 0, radius: levelRadius(1),
  color: '#7961ff', alive: true, invincible: 0, face: 0,
};

function resize() {
  width = innerWidth;
  height = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function createFood() {
  const rare = Math.random() < 0.08;
  return {
    x: rand(55, WORLD - 55), y: rand(55, WORLD - 55),
    radius: rare ? rand(7, 10) : rand(4, 7),
    color: rare ? '#ffd84d' : COLORS[Math.floor(Math.random() * COLORS.length)],
    value: rare ? 2 : 1, pulse: rand(0, TAU),
  };
}

function createBot(index) {
  const level = Math.max(1, Math.floor(Math.pow(Math.random(), 2.2) * 14));
  return {
    id: `bot-${index}`, name: BOT_NAMES[index % BOT_NAMES.length],
    x: rand(160, WORLD - 160), y: rand(160, WORLD - 160),
    vx: 0, vy: 0, level, xp: 0, radius: levelRadius(level),
    color: COLORS[(index + 1) % COLORS.length], alive: true,
    targetX: rand(0, WORLD), targetY: rand(0, WORLD), think: rand(0, 2),
    invincible: 0, face: rand(0, TAU),
  };
}

function resetWorld() {
  foods = Array.from({ length: FOOD_COUNT }, createFood);
  bots = Array.from({ length: BOT_COUNT }, (_, index) => createBot(index));
  particles = [];
  ripples = [];
  respawnPlayer(true);
}

function respawnPlayer(first = false) {
  player.x = WORLD / 2 + rand(-500, 500);
  player.y = WORLD / 2 + rand(-500, 500);
  player.vx = 0;
  player.vy = 0;
  player.level = 100;
  player.xp = 0;
  player.radius = levelRadius(player.level);
  player.alive = true;
  player.invincible = first ? 1 : 2.5;
  camera.x = player.x;
  camera.y = player.y;
  ui.death.hidden = true;
  updateHUD();
}

function respawnBot(bot) {
  bot.x = rand(150, WORLD - 150);
  bot.y = rand(150, WORLD - 150);
  bot.level = 1;
  bot.xp = 0;
  bot.radius = levelRadius(1);
  bot.alive = true;
  bot.invincible = 2;
}

function addXp(ball, amount) {
  ball.xp += amount;
  while (ball.xp >= xpGoal(ball.level)) {
    ball.xp -= xpGoal(ball.level);
    ball.level += 1;
    ball.radius = levelRadius(ball.level);
    ripples.push({ x: ball.x, y: ball.y, radius: ball.radius, life: 1, color: ball.color });
    burst(ball.x, ball.y, ball.color, 18);
    if (ball === player) {
      toast(`LEVEL ${ball.level} · 더 커졌어요!`);
      sound(520, 0.07, 'sine', 0.05);
      setTimeout(() => sound(720, 0.1, 'sine', 0.05), 65);
    }
  }
}

function burst(x, y, color, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, TAU);
    const speed = rand(45, 190);
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(0.35, 0.75), size: rand(2, 6), color });
  }
}

function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.remove('show');
  requestAnimationFrame(() => ui.toast.classList.add('show'));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ui.toast.classList.remove('show'), 1700);
}

function sound(frequency, duration, type = 'sine', volume = 0.025) {
  if (!audioOn) return;
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function getInputVector() {
  let x = 0;
  let y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;

  if (!x && !y && pointer.active) {
    const dx = pointer.x - width / 2;
    const dy = pointer.y - height / 2;
    const length = Math.hypot(dx, dy);
    if (length > 32) {
      const strength = Math.min(1, (length - 32) / 150);
      x = (dx / length) * strength;
      y = (dy / length) * strength;
    }
  }
  const length = Math.hypot(x, y) || 1;
  return { x: x / Math.max(1, length), y: y / Math.max(1, length) };
}

function movePlayer(dt) {
  if (!player.alive) return;
  const input = getInputVector();
  const speed = Math.max(115, 290 + player.radius * 1.55);
  const smoothing = 1 - Math.exp(-dt * 8);
  player.vx += (input.x * speed - player.vx) * smoothing;
  player.vy += (input.y * speed - player.vy) * smoothing;
  player.x = clamp(player.x + player.vx * dt, player.radius, WORLD - player.radius);
  player.y = clamp(player.y + player.vy * dt, player.radius, WORLD - player.radius);
  player.face += dt;
  player.invincible = Math.max(0, player.invincible - dt);
}

function nearestTarget(bot) {
  let flee = null;
  let prey = null;
  let food = null;
  let fleeDist = 520;
  let preyDist = 430;
  let foodDist = 700;
  const balls = [player, ...bots];

  for (const other of balls) {
    if (other === bot || !other.alive || other.invincible > 0) continue;
    const d = distance(bot, other);
    if (other.level > bot.level && d < fleeDist) { flee = other; fleeDist = d; }
    if (other.level < bot.level && d < preyDist) { prey = other; preyDist = d; }
  }
  if (flee) return { x: bot.x + (bot.x - flee.x) * 2, y: bot.y + (bot.y - flee.y) * 2 };
  if (prey) return prey;
  for (const dot of foods) {
    const d = distance(bot, dot);
    if (d < foodDist) { food = dot; foodDist = d; }
  }
  return food || { x: bot.targetX, y: bot.targetY };
}

function updateBots(dt) {
  for (const bot of bots) {
    if (!bot.alive) continue;
    bot.think -= dt;
    if (bot.think <= 0) {
      bot.think = rand(0.18, 0.5);
      const target = nearestTarget(bot);
      bot.targetX = target.x;
      bot.targetY = target.y;
    }
    const dx = bot.targetX - bot.x;
    const dy = bot.targetY - bot.y;
    const length = Math.hypot(dx, dy) || 1;
    if (length < 45) {
      bot.targetX = rand(80, WORLD - 80);
      bot.targetY = rand(80, WORLD - 80);
    }
    const speed = Math.max(95, 255 - bot.radius * 1.4) * rand(0.96, 1.03);
    const smoothing = 1 - Math.exp(-dt * 4.5);
    bot.vx += ((dx / length) * speed - bot.vx) * smoothing;
    bot.vy += ((dy / length) * speed - bot.vy) * smoothing;
    bot.x = clamp(bot.x + bot.vx * dt, bot.radius, WORLD - bot.radius);
    bot.y = clamp(bot.y + bot.vy * dt, bot.radius, WORLD - bot.radius);
    bot.invincible = Math.max(0, bot.invincible - dt);
  }
}

function eatFood(ball) {
  if (!ball.alive) return;
  for (let i = foods.length - 1; i >= 0; i -= 1) {
    if (distance(ball, foods[i]) < ball.radius + foods[i].radius) {
      const dot = foods[i];
      addXp(ball, dot.value);
      burst(dot.x, dot.y, dot.color, dot.value === 2 ? 7 : 4);
      foods[i] = createFood();
      if (ball === player) sound(dot.value === 2 ? 460 : 300, 0.045, 'sine', 0.018);
    }
  }
}

function resolveBallCollisions() {
  const balls = [player, ...bots].filter((ball) => ball.alive);
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i];
      const b = balls[j];
      if (a.invincible > 0 || b.invincible > 0 || a.level === b.level) continue;
      const bigger = a.level > b.level ? a : b;
      const smaller = bigger === a ? b : a;
      const d = distance(bigger, smaller);
      if (d < bigger.radius * 0.72 + smaller.radius * 0.3) consume(bigger, smaller);
    }
  }
}

function consume(eater, victim) {
  if (!victim.alive) return;
  victim.alive = false;
  addXp(eater, Math.max(2, Math.ceil(victim.level * 1.4)));
  burst(victim.x, victim.y, victim.color, 28);
  ripples.push({ x: victim.x, y: victim.y, radius: victim.radius, life: 1, color: victim.color });
  if (eater === player) {
    toast(`${victim.name} 냠!  +${Math.max(2, Math.ceil(victim.level * 1.4))} XP`);
    sound(130, 0.16, 'sawtooth', 0.035);
  }
  if (victim === player) showDeath(eater.name);
  else setTimeout(() => respawnBot(victim), 1200);
}

function showDeath(eaterName) {
  ui.eater.textContent = eaterName;
  ui.death.hidden = false;
  let count = 2;
  ui.respawnCount.textContent = count;
  sound(105, 0.5, 'sawtooth', 0.035);
  const timer = setInterval(() => {
    count -= 1;
    ui.respawnCount.textContent = Math.max(0, count);
    if (count <= 0) {
      clearInterval(timer);
      respawnPlayer();
    }
  }, 800);
}

function updateEffects(dt) {
  for (const dot of foods) dot.pulse += dt * 2.5;
  particles = particles.filter((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.95;
    particle.vy *= 0.95;
    particle.life -= dt;
    return particle.life > 0;
  });
  ripples = ripples.filter((ripple) => {
    ripple.radius += dt * 130;
    ripple.life -= dt * 1.7;
    return ripple.life > 0;
  });
}

function worldToScreen(x, y) {
  return { x: (x - camera.x) * camera.zoom + width / 2, y: (y - camera.y) * camera.zoom + height / 2 };
}

function updateCamera(dt) {
  const targetZoom = clamp(1.08 - player.radius / 400, 0.68, 1);
  const smoothing = 1 - Math.exp(-dt * 4);
  camera.x += (player.x - camera.x) * smoothing;
  camera.y += (player.y - camera.y) * smoothing;
  camera.zoom += (targetZoom - camera.zoom) * smoothing;
}

function roundedRect(context, x, y, w, h, radius) {
  context.beginPath();
  context.roundRect(x, y, w, h, radius);
}

function drawBackground() {
  ctx.fillStyle = '#090c19';
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.78);
  gradient.addColorStop(0, 'rgba(54, 40, 105, .25)');
  gradient.addColorStop(0.55, 'rgba(16, 22, 48, .12)');
  gradient.addColorStop(1, 'rgba(2, 4, 12, .54)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const gridSize = 85 * camera.zoom;
  const origin = worldToScreen(0, 0);
  ctx.strokeStyle = 'rgba(130, 143, 200, .055)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ((origin.x % gridSize) + gridSize) % gridSize; x < width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
  for (let y = ((origin.y % gridSize) + gridSize) % gridSize; y < height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke();

  const topLeft = worldToScreen(0, 0);
  const bottomRight = worldToScreen(WORLD, WORLD);
  ctx.strokeStyle = 'rgba(116, 92, 255, .45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function drawFood(food) {
  const pos = worldToScreen(food.x, food.y);
  const radius = food.radius * camera.zoom * (1 + Math.sin(food.pulse) * 0.08);
  if (pos.x < -20 || pos.x > width + 20 || pos.y < -20 || pos.y > height + 20) return;
  ctx.save();
  ctx.shadowColor = food.color;
  ctx.shadowBlur = food.value === 2 ? 18 : 9;
  ctx.fillStyle = food.color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath();
  ctx.arc(pos.x - radius * 0.3, pos.y - radius * 0.3, radius * 0.28, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawCrown(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = '#ffcc3d';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffd43b';
  ctx.strokeStyle = '#fff1a2';
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(-size * 0.52, size * 0.28);
  ctx.lineTo(-size * 0.64, -size * 0.32);
  ctx.lineTo(-size * 0.22, -size * 0.05);
  ctx.lineTo(0, -size * 0.55);
  ctx.lineTo(size * 0.22, -size * 0.05);
  ctx.lineTo(size * 0.64, -size * 0.32);
  ctx.lineTo(size * 0.52, size * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  roundedRect(ctx, -size * 0.54, size * 0.2, size * 1.08, size * 0.25, size * 0.08);
  ctx.fillStyle = '#ffb82e';
  ctx.fill();
  ctx.restore();
}

function drawBall(ball, isKing = false, remote = false) {
  if (!ball.alive) return;
  const pos = worldToScreen(ball.x, ball.y);
  const radius = levelRadius(ball.level) * camera.zoom;
  if (pos.x < -radius - 80 || pos.x > width + radius + 80 || pos.y < -radius - 100 || pos.y > height + radius + 80) return;
  const alpha = ball.invincible > 0 ? 0.55 + Math.sin(performance.now() / 80) * 0.25 : remote ? 0.78 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = ball.color;
  ctx.shadowBlur = Math.min(35, radius * 0.55);
  const gradient = ctx.createRadialGradient(pos.x - radius * 0.35, pos.y - radius * 0.42, radius * 0.05, pos.x, pos.y, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.08, ball.color);
  gradient.addColorStop(0.7, ball.color);
  gradient.addColorStop(1, '#17152f');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = ball === player ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.32)';
  ctx.lineWidth = ball === player ? 3 : 1.5;
  ctx.stroke();

  if (radius > 22) {
    const eyeY = pos.y - radius * 0.04;
    const eyeGap = radius * 0.27;
    ctx.fillStyle = 'rgba(14,12,30,.78)';
    ctx.beginPath();
    ctx.ellipse(pos.x - eyeGap, eyeY, radius * 0.075, radius * 0.115, 0, 0, TAU);
    ctx.ellipse(pos.x + eyeGap, eyeY, radius * 0.075, radius * 0.115, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(14,12,30,.7)';
    ctx.lineWidth = Math.max(1.5, radius * 0.035);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + radius * 0.15, radius * 0.18, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  const tagY = pos.y - radius - 18;
  ctx.font = `700 ${clamp(radius * 0.3, 11, 16)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText(ball.name, pos.x, tagY - 18);

  const label = `LV. ${ball.level}`;
  ctx.font = `800 ${clamp(radius * 0.34, 12, 18)}px Inter, sans-serif`;
  const labelWidth = ctx.measureText(label).width + 20;
  roundedRect(ctx, pos.x - labelWidth / 2, tagY - 10, labelWidth, 24, 12);
  ctx.fillStyle = ball === player ? 'rgba(100,73,245,.92)' : 'rgba(7,9,22,.82)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(label, pos.x, tagY + 7);
  if (isKing) drawCrown(pos.x, tagY - 48, clamp(radius * 0.48, 22, 36));
  ctx.restore();
}

function drawEffects() {
  for (const ripple of ripples) {
    const pos = worldToScreen(ripple.x, ripple.y);
    ctx.strokeStyle = ripple.color;
    ctx.globalAlpha = ripple.life;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ripple.radius * camera.zoom, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const particle of particles) {
    const pos = worldToScreen(particle.x, particle.y);
    ctx.globalAlpha = Math.min(1, particle.life * 2);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, particle.size * camera.zoom, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function getAllRanked() {
  const remote = Object.entries(remotePlayers).map(([id, ball]) => ({
    id, name: ball.name || '온라인 공', level: ball.level || 1,
    x: ball.x || 0, y: ball.y || 0, color: ball.color || '#35d3ca',
    alive: true, invincible: 0,
  }));
  return [player, ...bots.filter((bot) => bot.alive), ...remote].sort((a, b) => b.level - a.level);
}

function drawWarnings() {
  warnings = bots.filter((bot) => bot.alive && bot.level > player.level && distance(bot, player) < 620 && distance(bot, player) > 250);
  for (const danger of warnings) {
    const dx = danger.x - player.x;
    const dy = danger.y - player.y;
    const angle = Math.atan2(dy, dx);
    const edgeX = width / 2 + Math.cos(angle) * Math.min(width * 0.39, 360);
    const edgeY = height / 2 + Math.sin(angle) * Math.min(height * 0.34, 250);
    ctx.save();
    ctx.translate(edgeX, edgeY);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(255,78,105,.9)';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(10, 9);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function render() {
  drawBackground();
  for (const food of foods) drawFood(food);
  const ranked = getAllRanked();
  const kingId = ranked[0]?.id;
  const drawables = [...bots, ...ranked.filter((ball) => !bots.includes(ball) && ball !== player), player]
    .sort((a, b) => a.level - b.level);
  for (const ball of drawables) drawBall(ball, ball.id === kingId, ball.id !== 'me' && !String(ball.id).startsWith('bot-'));
  drawEffects();
  if (player.alive) drawWarnings();
}

function updateHUD() {
  const goal = xpGoal(player.level);
  ui.level.textContent = player.level;
  ui.xpText.textContent = `${player.xp} / ${goal} XP`;
  ui.xpFill.style.width = `${(player.xp / goal) * 100}%`;
}

function updateLeaderboard() {
  const ranked = getAllRanked().slice(0, 6);
  ui.leaderboardList.innerHTML = ranked.map((ball, index) => `
    <li class="${ball === player ? 'me' : ''}">
      <span class="rank">${index === 0 ? '♛' : index + 1}</span>
      <i style="--ball-color:${ball.color}"></i>
      <b>${escapeHtml(ball.name)}</b>
      <em>LV.${ball.level}</em>
    </li>`).join('');
}

function updateMinimap() {
  mctx.clearRect(0, 0, 160, 160);
  mctx.fillStyle = 'rgba(7,9,22,.82)';
  mctx.fillRect(0, 0, 160, 160);
  mctx.strokeStyle = 'rgba(143,125,255,.4)';
  mctx.strokeRect(5, 5, 150, 150);
  for (const bot of bots) {
    if (!bot.alive) continue;
    mctx.fillStyle = bot.level > player.level ? '#ff5578' : 'rgba(255,255,255,.32)';
    mctx.beginPath();
    mctx.arc(5 + (bot.x / WORLD) * 150, 5 + (bot.y / WORLD) * 150, bot.level > player.level ? 2.2 : 1.2, 0, TAU);
    mctx.fill();
  }
  mctx.fillStyle = '#8f7dff';
  mctx.shadowColor = '#8f7dff';
  mctx.shadowBlur = 7;
  mctx.beginPath();
  mctx.arc(5 + (player.x / WORLD) * 150, 5 + (player.y / WORLD) * 150, 3.8, 0, TAU);
  mctx.fill();
  mctx.shadowBlur = 0;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

let leaderboardTimer = 0;
function update(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (running) {
    movePlayer(dt);
    updateBots(dt);
    eatFood(player);
    for (const bot of bots) eatFood(bot);
    resolveBallCollisions();
    updateEffects(dt);
    updateCamera(dt);
    updateHUD();
    publishPlayer(player);
    leaderboardTimer -= dt;
    if (leaderboardTimer <= 0) {
      leaderboardTimer = 0.3;
      updateLeaderboard();
      updateMinimap();
    }
  }
  render();
  animationId = requestAnimationFrame(update);
}

async function startGame() {
  playerName = ui.nickname.value.trim() || '말랑이';
  player.name = playerName.slice(0, 12);
  ui.playerName.textContent = player.name;
  ui.start.classList.add('leaving');
  setTimeout(() => { ui.start.hidden = true; }, 440);
  [ui.hud, ui.leaderboard, ui.minimap, ui.controls].forEach((el) => { el.hidden = false; });
  if (matchMedia('(pointer: coarse)').matches) ui.stick.hidden = false;
  resetWorld();
  running = true;
  const connection = await connectArena(player.name, (players) => { remotePlayers = players; });
  if (connection.online) {
    ui.status.classList.add('online');
    ui.status.querySelector('span').textContent = 'Firebase 온라인';
    toast('온라인 아레나에 연결됐어요');
  } else {
    ui.status.querySelector('span').textContent = '로컬 아레나 · 봇 22';
  }
}

ui.form.addEventListener('submit', (event) => {
  event.preventDefault();
  startGame();
});

ui.sound.addEventListener('click', () => {
  audioOn = !audioOn;
  ui.sound.textContent = audioOn ? '♬' : '×';
  ui.sound.classList.toggle('muted', !audioOn);
});

addEventListener('resize', resize);
addEventListener('keydown', (event) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
});
addEventListener('keyup', (event) => keys.delete(event.code));
canvas.addEventListener('pointermove', (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.active = true;
  if (touchStart) {
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    const length = Math.hypot(dx, dy);
    const max = 38;
    ui.stick.querySelector('i').style.transform = `translate(${(dx / Math.max(length, max)) * Math.min(length, max)}px, ${(dy / Math.max(length, max)) * Math.min(length, max)}px)`;
  }
});
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  touchStart = { x: event.clientX, y: event.clientY };
  if (matchMedia('(pointer: coarse)').matches) {
    ui.stick.style.left = `${event.clientX - 55}px`;
    ui.stick.style.top = `${event.clientY - 55}px`;
  }
});
canvas.addEventListener('pointerup', () => {
  touchStart = null;
  pointer.active = false;
  ui.stick.querySelector('i').style.transform = '';
});

resize();
resetWorld();
cancelAnimationFrame(animationId);
animationId = requestAnimationFrame(update);
