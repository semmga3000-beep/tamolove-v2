const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const roomLabel = document.getElementById("room");
const houseCodeEl = document.getElementById("houseCode");
const partnerInfo = document.getElementById("partnerInfo");
const inviteBtn = document.getElementById("inviteBtn");
const lobby = document.getElementById("lobby");
const lobbyError = document.getElementById("lobbyError");
const nameInput = document.getElementById("nameInput");
const codeInput = document.getElementById("codeInput");
const toastEl = document.getElementById("toast");
const actBtn = document.getElementById("actBtn");
const actIcon = document.getElementById("actIcon");
const actLabel = document.getElementById("actLabel");

const T = 16;
const COLS = 20;
const ROWS = 14;
canvas.width = COLS * T;
canvas.height = ROWS * T;
ctx.imageSmoothingEnabled = false;

// ---------- Память телефона ----------
function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {}
}
function load(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

let playerId = load("tamolove_id");
if (!playerId) {
  playerId = "p" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  store("tamolove_id", playerId);
}
nameInput.value = load("tamolove_name") || "";

// ---------- Комнаты ----------
const roomNames = {
  topLeft: "Кухня",
  topRight: "Гостиная",
  bottomLeft: "Спальня",
  bottomRight: "Зона уборки"
};
const roleNames = { caregiver: "Ведущий", receiver: "Ведомый" };
const floorColors = {
  topLeft: ["#f6e7c1", "#efdcae"],
  topRight: ["#f9d9e3", "#f3cbd8"],
  bottomLeft: ["#d9e4f7", "#cddaf0"],
  bottomRight: ["#d8f0e0", "#c9e6d3"]
};

const doorsV = [3, 10];
const doorsH = [4, 14];

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

// Места для действий (те же, что на сервере)
const ZONES = {
  stove: [{ x: 5, y: 1, w: 1, h: 1 }],
  bowl: [{ x: 7, y: 5, w: 1, h: 1 }],
  bed: [{ x: 1, y: 9, w: 3, h: 2 }],
  clean: [{ x: 17, y: 10, w: 1, h: 1 }, { x: 16, y: 12, w: 2, h: 1 }]
};
const REACH = 1.3;

function near(p, zoneName) {
  return ZONES[zoneName].some((z) => {
    const dx = Math.max(z.x - p.x, 0, p.x - (z.x + z.w));
    const dy = Math.max(z.y - p.y, 0, p.y - (z.y + z.h));
    return Math.hypot(dx, dy) <= REACH;
  });
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------- Персонажи ----------
const looks = {
  caregiver: { skin: "#f5c9a0", hair: "#5a3825", shirt: "#ff6f91", pants: "#4a5a8a" },
  receiver: { skin: "#f5c9a0", hair: "#2f2a3a", shirt: "#6fa8ff", pants: "#5a4a7a" }
};

// Это я
const player = {
  x: 17.5,
  y: 3.5,
  speed: 3.6,
  facing: "down",
  name: "",
  carrying: false
};
// Это второй игрок
const partner = {
  present: false,
  online: false,
  x: 0,
  y: 0,
  tx: 0,
  ty: 0,
  facing: "down",
  name: "",
  carrying: false
};
const HALF = 0.3;

let myRole = null;
let partnerRole = null;
let gotOwnPosition = false;
let emoteUntil = 0;

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

// ---------- Подсказки и всплывающий текст ----------
let toastTimer = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function setBar(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const v = Math.max(0, Math.min(100, value || 0));
  el.firstElementChild.style.width = v + "%";
  el.classList.toggle("low", v < 30);
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
  if (e.target && e.target.tagName === "INPUT") return;
  if (e.key === "e" || e.key === "E" || e.key === " ") {
    if (!e.repeat) doAct();
    e.preventDefault();
    return;
  }
  if (keyMap[e.key]) { keys[keyMap[e.key]] = true; e.preventDefault(); }
});
window.addEventListener("keyup", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (keyMap[e.key]) { keys[keyMap[e.key]] = false; e.preventDefault(); }
});

// Кнопка действия: если держать, действие повторяется
let actTimer = null;
function doAct() {
  if (!session) return;
  sendMsg({ type: "act" });
}
function startAct(e) {
  e.preventDefault();
  doAct();
  clearInterval(actTimer);
  actTimer = setInterval(doAct, 600);
}
function stopAct(e) {
  if (e) e.preventDefault();
  clearInterval(actTimer);
  actTimer = null;
}
actBtn.addEventListener("pointerdown", startAct);
actBtn.addEventListener("pointerup", stopAct);
actBtn.addEventListener("pointerleave", stopAct);
actBtn.addEventListener("pointercancel", stopAct);
actBtn.addEventListener("contextmenu", (e) => e.preventDefault());

document.getElementById("emoBtn").addEventListener("click", () => {
  emoteUntil = performance.now() + 1500;
});
document.getElementById("lookBtn").addEventListener("click", () => {
  showToast("Смена внешности появится на следующем этапе 🎨");
});

function actionInfo() {
  if (!myRole || !session) return ["✋", "Действие"];
  const p = player;
  if (myRole === "caregiver") {
    if (near(p, "stove")) return p.carrying ? ["🍲", "Уже несёшь"] : ["🍳", "Готовить"];
    if (near(p, "bowl")) return p.carrying ? ["🥣", "В миску"] : ["🍳", "Нужна еда"];
    if (p.carrying && partner.present && dist(p, partner) < 1.8) return ["🥄", "Покормить"];
  } else if (near(p, "bowl")) {
    return ["😋", "Есть"];
  }
  if (near(p, "bed")) return ["💤", "Отдых"];
  if (near(p, "clean")) return ["🧹", "Убрать"];
  return ["✋", "Действие"];
}

let lastActText = "";
function updateActionButton() {
  const info = actionInfo();
  const key = info[0] + info[1];
  if (key === lastActText) return;
  lastActText = key;
  actIcon.textContent = info[0];
  actLabel.textContent = info[1];
}

// ---------- Связь с сервером ----------
let ws = null;
let session = null;        // { code } после входа в дом
let pendingAction = null;  // создать или войти, пока ждём ответ
let selectedRole = "caregiver";

const savedCode = load("tamolove_code");
const urlCode = new URLSearchParams(location.search).get("code");
if (urlCode) {
  codeInput.value = urlCode.toUpperCase().slice(0, 5);
} else if (savedCode) {
  session = { code: savedCode };
}

function sendMsg(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function connect() {
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(proto + location.host);

  ws.onopen = () => {
    if (pendingAction) {
      sendMsg(pendingAction);
    } else if (session) {
      sendMsg({
        type: "join",
        code: session.code,
        playerId: playerId,
        name: nameInput.value
      });
    }
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    handleMessage(msg);
  };

  ws.onclose = () => {
    setTimeout(connect, 2000);
  };
}

function showError(text) {
  lobbyError.textContent = text;
}

function handleMessage(msg) {
  if (msg.type === "joined") {
    pendingAction = null;
    session = { code: msg.code };
    myRole = msg.role;
    partnerRole = msg.role === "caregiver" ? "receiver" : "caregiver";
    gotOwnPosition = false;
    store("tamolove_code", msg.code);
    houseCodeEl.textContent = msg.code;
    lobby.classList.add("hidden");
    showError("");
    return;
  }

  if (msg.type === "error") {
    pendingAction = null;
    session = null;
    store("tamolove_code", null);
    showError(msg.text);
    lobby.classList.remove("hidden");
    return;
  }

  if (msg.type === "toast") {
    showToast(msg.text);
    return;
  }

  if (msg.type === "state") {
    const mine = msg.players[myRole];
    if (mine) {
      player.name = mine.name;
      player.carrying = mine.carrying;
      if (!gotOwnPosition) {
        player.x = mine.x;
        player.y = mine.y;
        player.facing = mine.facing;
        gotOwnPosition = true;
      }
      document.getElementById("meName").textContent =
        mine.name + " (" + roleNames[myRole] + ")" + (mine.carrying ? " 🍲" : "");
      setBar("meSat", mine.satiety);
      setBar("meEne", mine.energy);
      setBar("meMood", mine.mood);
    }

    const other = msg.players[partnerRole];
    if (other) {
      if (!partner.present) {
        partner.x = other.x;
        partner.y = other.y;
      }
      partner.present = true;
      partner.online = other.online;
      partner.tx = other.x;
      partner.ty = other.y;
      partner.facing = other.facing;
      partner.name = other.name;
      partner.carrying = other.carrying;
      document.getElementById("paName").textContent =
        other.name + " (" + roleNames[partnerRole] + ")" + (other.carrying ? " 🍲" : "");
      setBar("paSat", other.satiety);
      setBar("paEne", other.energy);
      setBar("paMood", other.mood);
      partnerInfo.textContent = other.online ? other.name + " в сети ❤️" : other.name + " спит 💤";
    } else {
      partner.present = false;
      document.getElementById("paName").textContent = "Ждём второго игрока";
      setBar("paSat", 0);
      setBar("paEne", 0);
      setBar("paMood", 0);
      partnerInfo.textContent = "Нажми «Пригласить»";
    }

    if (msg.house) {
      setBar("houseClean", msg.house.clean);
      setBar("houseBowl", msg.house.bowl);
    }
  }
}

connect();
setInterval(() => sendMsg({ type: "ping" }), 25000);

// ---------- Стартовый экран ----------
const roleCaregiver = document.getElementById("roleCaregiver");
const roleReceiver = document.getElementById("roleReceiver");
function selectRole(role) {
  selectedRole = role;
  roleCaregiver.classList.toggle("sel", role === "caregiver");
  roleReceiver.classList.toggle("sel", role === "receiver");
}
roleCaregiver.addEventListener("click", () => selectRole("caregiver"));
roleReceiver.addEventListener("click", () => selectRole("receiver"));

function rememberName() {
  store("tamolove_name", nameInput.value.trim());
}

document.getElementById("createBtn").addEventListener("click", () => {
  rememberName();
  showError("Создаём дом...");
  pendingAction = {
    type: "create",
    playerId: playerId,
    role: selectedRole,
    name: nameInput.value
  };
  session = null;
  sendMsg(pendingAction);
});

document.getElementById("joinBtn").addEventListener("click", () => {
  const code = codeInput.value.trim().toUpperCase();
  if (code.length < 5) {
    showError("Введи код из 5 символов");
    return;
  }
  rememberName();
  showError("Входим...");
  pendingAction = {
    type: "join",
    code: code,
    playerId: playerId,
    name: nameInput.value
  };
  session = null;
  sendMsg(pendingAction);
});

inviteBtn.addEventListener("click", async () => {
  if (!session) return;
  const link = location.origin + "/?code=" + session.code;
  const text = "Заходи в наш дом в TamoLove! Код: " + session.code + "\n" + link;
  try {
    if (navigator.share) {
      await navigator.share({ text: text });
      return;
    }
  } catch (e) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    alert("Приглашение скопировано. Отправь его второму игроку.");
  } catch (e) {
    prompt("Скопируй и отправь второму игроку:", text);
  }
});

// ---------- Обновление ----------
let lastSent = 0;
let dirty = false;
let lastFacing = "down";

function update(dt, now) {
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
    let moved = false;
    if (!blockedAt(nx, player.y)) { player.x = nx; moved = true; }
    if (!blockedAt(player.x, ny)) { player.y = ny; moved = true; }
    if (moved || player.facing !== lastFacing) dirty = true;
    lastFacing = player.facing;
  }

  // отправляем свои шаги не чаще ~16 раз в секунду
  if (dirty && gotOwnPosition && session && now - lastSent > 60) {
    sendMsg({
      type: "move",
      x: player.x,
      y: player.y,
      facing: player.facing
    });
    lastSent = now;
    dirty = false;
  }

  // плавно подтягиваем второго игрока к его позиции
  if (partner.present) {
    const k = Math.min(1, dt * 12);
    partner.x += (partner.tx - partner.x) * k;
    partner.y += (partner.ty - partner.y) * k;
  }

  const key = roomKeyAt(Math.floor(player.x), Math.floor(player.y));
  if (roomLabel.textContent !== roomNames[key]) {
    roomLabel.textContent = roomNames[key];
  }

  updateActionButton();
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

// Миска показывает, сколько в ней еды
let bowlLevel = 0;
function drawBowlFood() {
  const f = furniture[4];
  if (bowlLevel <= 0) return;
  const px = f.x * T + 4;
  const py = f.y * T + 4;
  const h = Math.max(2, Math.round((bowlLevel / 100) * 8));
  ctx.fillStyle = "#e8803a";
  ctx.fillRect(px, py + (8 - h), 8, h);
}

function drawCharacter(c, look, name, sleeping) {
  const px = Math.round(c.x * T - 5);
  const py = Math.round(c.y * T - 10);
  ctx.globalAlpha = sleeping ? 0.55 : 1;
  // тень
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(px, py + 15, 10, 3);
  // ноги
  ctx.fillStyle = look.pants;
  ctx.fillRect(px + 2, py + 12, 2, 4);
  ctx.fillRect(px + 6, py + 12, 2, 4);
  // тело
  ctx.fillStyle = look.shirt;
  ctx.fillRect(px + 1, py + 7, 8, 6);
  // голова
  ctx.fillStyle = look.skin;
  ctx.fillRect(px + 1, py + 1, 8, 7);
  // волосы и чёлка
  ctx.fillStyle = look.hair;
  ctx.fillRect(px, py, 10, 3);
  if (c.facing === "up") {
    ctx.fillRect(px, py, 10, 7);
  } else {
    ctx.fillRect(px, py + 3, 2, 3);
    ctx.fillRect(px + 8, py + 3, 2, 3);
    ctx.fillRect(px + 2, py + 3, 3, 1);
  }
  // глаза (во сне закрыты)
  if (c.facing !== "up") {
    ctx.fillStyle = "#222";
    if (sleeping) {
      ctx.fillRect(px + 2, py + 6, 2, 1);
      ctx.fillRect(px + 6, py + 6, 2, 1);
    } else if (c.facing === "left") {
      ctx.fillRect(px + 2, py + 5, 2, 2);
    } else if (c.facing === "right") {
      ctx.fillRect(px + 6, py + 5, 2, 2);
    } else {
      ctx.fillRect(px + 2, py + 5, 2, 2);
      ctx.fillRect(px + 6, py + 5, 2, 2);
    }
  }
  // еда в руках
  if (c.carrying) {
    ctx.fillStyle = "#8b5e34";
    ctx.fillRect(px + 7, py + 8, 6, 5);
    ctx.fillStyle = "#e8803a";
    ctx.fillRect(px + 8, py + 8, 4, 2);
  }
  // имя
  if (name) {
    ctx.font = "bold 7px sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(name, px + 5, py - 2);
    ctx.fillStyle = "#6b2d45";
    ctx.fillText(name, px + 5, py - 2);
  }
  // сон
  if (sleeping) {
    ctx.font = "bold 7px sans-serif";
    ctx.fillStyle = "#4a5a8a";
    ctx.fillText("Zzz", px + 12, py - 6);
  }
  ctx.globalAlpha = 1;
}

function drawHeart(c) {
  const px = Math.round(c.x * T);
  const py = Math.round(c.y * T - 24);
  ctx.fillStyle = "#e0306a";
  ctx.fillRect(px - 4, py, 3, 2);
  ctx.fillRect(px + 1, py, 3, 2);
  ctx.fillRect(px - 5, py + 1, 10, 2);
  ctx.fillRect(px - 4, py + 3, 8, 1);
  ctx.fillRect(px - 2, py + 4, 4, 1);
  ctx.fillRect(px - 1, py + 5, 2, 1);
}

function draw(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFloor();
  drawWalls();
  drawFurniture();
  drawBowlFood();

  const list = [];
  if (myRole) {
    list.push({ c: player, look: looks[myRole], name: player.name, sleeping: false });
  }
  if (partner.present && partnerRole) {
    list.push({ c: partner, look: looks[partnerRole], name: partner.name, sleeping: !partner.online });
  }
  list.sort((a, b) => a.c.y - b.c.y);
  for (const item of list) {
    drawCharacter(item.c, item.look, item.name, item.sleeping);
  }
  if (myRole && now < emoteUntil) drawHeart(player);
}

// ---------- Размер экрана ----------
function fitCanvas() {
  const wrap = document.getElementById("gameWrap");
  const w = wrap.clientWidth - 12;
  const h = wrap.clientHeight - 16;
  const scale = Math.max(0.5, Math.min(w / canvas.width, h / canvas.height));
  canvas.style.width = Math.floor(canvas.width * scale) + "px";
  canvas.style.height = Math.floor(canvas.height * scale) + "px";
}
window.addEventListener("resize", fitCanvas);
setTimeout(fitCanvas, 50);
fitCanvas();

// ---------- Главный цикл ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt, now);
  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// уровень еды в миске берём из сообщений сервера
const bowlBar = document.getElementById("houseBowl");
setInterval(() => {
  bowlLevel = parseFloat(bowlBar.firstElementChild.style.width) || 0;
}, 300);
