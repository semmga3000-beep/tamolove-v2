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
  name: ""
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
  name: ""
};
const HALF = 0.3;

let myRole = null;
let partnerRole = null;
let gotOwnPosition = false;

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
  if (e.target && e.target.tagName === "INPUT") return;
  if (keyMap[e.key]) { keys[keyMap[e.key]] = true; e.preventDefault(); }
});
window.addEventListener("keyup", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (keyMap[e.key]) { keys[keyMap[e.key]] = false; e.preventDefault(); }
});

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

  if (msg.type === "state") {
    const mine = msg.players[myRole];
    if (mine) {
      player.name = mine.name;
      if (!gotOwnPosition) {
        player.x = mine.x;
        player.y = mine.y;
        player.facing = mine.facing;
        gotOwnPosition = true;
      }
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
      if (other.online) {
        partnerInfo.textContent = "Рядом: " + other.name;
      } else {
        partnerInfo.textContent = other.name + " сейчас не в сети";
      }
    } else {
      partner.present = false;
      partnerInfo.textContent = "Ждём второго игрока. Нажми «Пригласить»";
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
  try
