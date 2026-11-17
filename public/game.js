const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const roomLabel = document.getElementById("room");

const T = 16;
const COLS = 20;
const ROWS = 14;
canvas.width = COLS * T;
canvas.height = ROWS * T;
ctx.imageSmoothingEnabled = false;

// ---------- Комнаты ----------
const roomNames = {
  topLeft: "Кухня",
  topRight: "Гостиная",
  bottomLeft: "Спальня",
  bottomRight: "Зона уборки"
};
const floorColors = {
  topLeft: ["#f6e7c1", "#efdcae"],
  topRight: ["#f9d9e3", "#f3cbd8"],
  bottomLeft: ["#d9e4f7", "#cddaf0"],
  bottomRight: ["#d8f0e0", "#c9e6d3"]
};

// Проёмы в стенах (двери)
const doorsV = [3, 10]; // в вертикальной стене (x = 10), номера строк
const doorsH = [4, 14]; // в горизонтальной стене (y = 7), номера столбцов

function roomKeyAt(tx, ty) {
  const left = tx < 10;
  const top = ty < 7;
  if (top && left) return "topLeft";
  if (top && !left) return "topRight";
  if (!top && left) return "bottomLeft";
  return "bottomRight";
}

function isWall(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  if (tx === 0 || ty === 0 || tx === COLS - 1 || ty === ROWS - 1) return true;
  if (tx === 10 && !doorsV.includes(ty)) return true;
  if (ty === 7 && !doorsH.includes(tx)) return true;
  return false;
}

// ---------- Мебель ----------
// x, y, w, h в клетках; solid: true значит пройти нельзя
const furniture = [
  // Кухня
  { x: 1, y: 1, w: 4, h: 1, color: "#d9b38c", edge: "#a67c52", solid: true },
  { x: 5, y: 1, w: 1, h: 1, color: "#8f8f9a", edge: "#5d5d68", solid: true },
  { x: 8, y: 1, w: 1, h: 1, color: "#e8f1f5", edge: "#9db4c0", solid: true },
  { x: 3, y: 4, w: 3, h: 2, color: "#c28e5c", edge: "#8b5e34", solid: true },
  { x: 7, y: 5, w: 1, h: 1, color: "#ff8fb1", edge: "#c2587c", solid: false },
  // Спальня
  { x: 1, y: 9, w: 3, h: 2, color: "#ffffff", edge: "#e07a9a", solid: true },
  { x: 4, y: 9, w: 1, h: 1, color: "#c28e5c", edge: "#8b5e34", solid: true },
  { x: 7, y: 8, w: 2, h: 1, color: "#a67c52", edge: "#6e4d2e", solid: true },
  // Гостиная
  { x: 12, y: 3, w: 5, h: 3, color: "#f2a7bd", edge: "#e07a9a", solid: false },
  { x: 13, y: 1, w: 2, h: 1, color: "#3b3b4f", edge: "#1f1f2e", solid: true },
  { x: 13, y: 4, w: 3, h: 1, color: "#b57edc", edge: "#7d4fa3", solid: true },
  { x: 18, y: 1, w: 1, h: 1, color: "#5cb85c", edge: "#3a7d3a", solid: true },
  // Зона уборки
  { x: 11, y: 8, w: 3, h: 1, color: "#c28e5c", edge: "#8b5e34", solid: true },
  { x: 17, y: 10, w: 1, h: 1, color: "#6fb7e8", edge: "#3e84b5", solid: true },
  { x: 16, y: 12, w: 2, h: 1, color: "#f0f0f0", edge: "#a8a8a8", solid: true }
];

// ---------- Персонаж ----------
const player = {
  x: 17.5,
  y: 3.5,
  speed: 3.6,
  facing: "down",
  skin: "#f5c9a0",
  hair: "#5a3825",
  shirt: "#ff6f91",
  pants: "#4a5a8a"
};
const HALF = 0.3;

function blockedAt(px, py) {
  const corners = [
    [px - HALF, py - HALF],
    [px + HALF, py - HALF],
    [px - HALF, py + HALF],
    [px + HALF, py + HALF]
  ];
  for (const [cx, cy] of corners) {
    if (isWall(Math.floor(cx), Math.floor(cy))) return true;
  }
  for (const f of furniture) {
    if (!f.solid) continue;
    if (
      px + HALF > f.x &&
      px - HALF < f.x + f.w &&
      py + HALF > f.y &&
      py - HALF < f.y + f.h
    ) {
      return true;
    }
  }
  return false;
}

// ---------- Управление ----------
const keys = { up: false, down: false, left: false, right: false };

function bindButton(id, dir) {
  const el = document.getElementById(id);
  const press = (e) => { e.preventDefault(); keys[dir] = true; };
  const release = (e) => { e.preventDefault(); keys[dir] = false; };
  el.addEventListener("pointerdown", press);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointerleave", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
bindButton("up", "up");
bindButton("down", "down");
bindButton("left", "left");
bindButton("right", "right");

const keyMap = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right"
};
window.addEventListener("keydown", (e) => {
  if (keyMap[e.key]) { keys[keyMap[e.key]] = true; e.preventDefault(); }
});
window.addEventListener("keyup", (e) => {
  if (keyMap[e.key]) { keys[keyMap[e.key]] = false; e.preventDefault(); }
});

// ---------- Обновление ----------
function update(dt) {
  let dx = 0;
  let dy = 0;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;

  if (dx !== 0 || dy !== 0) {
    if (dy < 0) player.facing = "up";
    else if (dy > 0) player.facing = "down";
    else if (dx < 0) player.facing = "left";
    else player.facing = "right";

    const len = Math.hypot(dx, dy);
    const step = player.speed * dt;
    const nx = player.x + (dx / len) * step;
    const ny = player.y + (dy / len) * step;
    if (!blockedAt(nx, player.y)) player.x = nx;
    if (!blockedAt(player.x, ny)) player.y = ny;
  }

  const key = roomKeyAt(Math.floor(player.x), Math.floor(player.y));
  if (roomLabel.textContent !== roomNames[key]) {
    roomLabel.textContent = roomNames[key];
  }
}

// ---------- Рисование ----------
function drawFloor() {
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (isWall(tx, ty)) continue;
      const colors = floorColors[roomKeyAt(tx, ty)];
      ctx.fillStyle = colors[(tx + ty) % 2];
      ctx.fillRect(tx * T, ty * T, T, T);
    }
  }
}

function drawWalls() {
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (!isWall(tx, ty)) continue;
      ctx.fillStyle = "#8b5e6f";
      ctx.fillRect(tx * T, ty * T, T, T);
      ctx.fillStyle = "#a87689";
      ctx.fillRect(tx * T, ty * T, T, 4);
    }
  }
}

function drawFurniture() {
  for (const f of furniture) {
    const px = f.x * T;
    const py = f.y * T;
    const w = f.w * T;
    const h = f.h * T;
    ctx.fillStyle = f.edge;
    ctx.fillRect(px + 1, py + 1, w - 2, h - 2);
    ctx.fillStyle = f.color;
    ctx.fillRect(px + 3, py + 3, w - 6, h - 6);
  }
}

function drawPlayer() {
  const px = Math.round(player.x * T - 5);
  const py = Math.round(player.y * T - 10);
  // тень
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(px, py + 15, 10, 3);
  // ноги
  ctx.fillStyle = player.pants;
  ctx.fillRect(px + 2, py + 12, 2, 4);
  ctx.fillRect(px + 6, py + 12, 2, 4);
  // тело
  ctx.fillStyle = player.shirt;
  ctx.fillRect(px + 1, py + 7, 8, 6);
  // голова
  ctx.fillStyle = player.skin;
  ctx.fillRect(px + 1, py + 1, 8, 7);
  // волосы и чёлка
  ctx.fillStyle = player.hair;
  ctx.fillRect(px, py, 10, 3);
  if (player.facing === "up") {
    ctx.fillRect(px, py, 10, 7);
  } else {
    ctx.fillRect(px, py + 3, 2, 3);
    ctx.fillRect(px + 8, py + 3, 2, 3);
    ctx.fillRect(px + 2, py + 3, 3, 1);
  }
  // глаза
  if (player.facing !== "up") {
    ctx.fillStyle = "#222";
    if (player.facing === "left") {
      ctx.fillRect(px + 2, py + 5, 2, 2);
    } else if (player.facing === "right") {
      ctx.fillRect(px + 6, py + 5, 2, 2);
    } else {
      ctx.fillRect(px + 2, py + 5, 2, 2);
      ctx.fillRect(px + 6, py + 5, 2, 2);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFloor();
  drawWalls();
  drawFurniture();
  drawPlayer();
}

// ---------- Размер экрана ----------
function fitCanvas() {
  const wrap = document.getElementById("gameWrap");
  const sx = Math.floor((wrap.clientWidth - 8) / canvas.width);
  const sy = Math.floor((wrap.clientHeight - 8) / canvas.height);
  const scale = Math.max(1, Math.min(sx, sy));
  canvas.style.width = canvas.width * scale + "px";
  canvas.style.height = canvas.height * scale + "px";
}
window.addEventListener("resize", fitCanvas);
fitCanvas();

// ---------- Главный цикл ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
