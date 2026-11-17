const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---------- Хранение домов ----------
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "houses.json");
let houses = {};
try {
  houses = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (e) {
  houses = {};
}

let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(houses));
    } catch (e) {
      console.log("Не удалось сохранить:", e.message);
    }
  }, 2000);
}

// Кто сейчас подключён (хранится только в памяти)
const live = {};

const ROLES = ["caregiver", "receiver"];
const SPAWN = {
  caregiver: { x: 12.5, y: 2.5 },
  receiver: { x: 16.5, y: 2.5 }
};
const DEFAULT_NAMES = { caregiver: "Ведущий", receiver: "Ведомый" };

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (houses[code]);
  return code;
}

function cleanName(name, role) {
  const s = String(name || "").trim().slice(0, 12);
  return s || DEFAULT_NAMES[role];
}

function makePlayer(id, role, name) {
  return {
    id,
    name: cleanName(name, role),
    x: SPAWN[role].x,
    y: SPAWN[role].y,
    facing: "down"
  };
}

function publicState(code) {
  const house = houses[code];
  const players = {};
  for (const role of ROLES) {
    const p = house.players[role];
    if (p) {
      players[role] = {
        name: p.name,
        x: p.x,
        y: p.y,
        facing: p.facing,
        online: !!(live[code] && live[code][role])
      };
    }
  }
  return { type: "state", code, players };
}

function broadcast(code) {
  if (!houses[code] || !live[code]) return;
  const msg = JSON.stringify(publicState(code));
  for (const role of ROLES) {
    const sock = live[code][role];
    if (sock && sock.readyState === 1) sock.send(msg);
  }
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function attach(ws, code, role) {
  if (!live[code]) live[code] = {};
  const old = live[code][role];
  if (old && old !== ws) {
    old.house = null;
    old.close();
  }
  live[code][role] = ws;
  ws.house = code;
  ws.role = role;
  send(ws, { type: "joined", code, role });
  broadcast(code);
}

// ---------- Связь с телефонами ----------
wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (msg.type === "create") {
      const playerId = String(msg.playerId || "");
      if (!playerId || !ROLES.includes(msg.role)) return;
      const code = makeCode();
      houses[code] = { code, players: {} };
      houses[code].players[msg.role] = makePlayer(playerId, msg.role, msg.name);
      saveSoon();
      attach(ws, code, msg.role);
      return;
    }

    if (msg.type === "join") {
      const playerId = String(msg.playerId || "");
      const code = String(msg.code || "").trim().toUpperCase();
      const house = houses[code];
      if (!playerId) return;
      if (!house) {
        send(ws, { type: "error", text: "Дом с таким кодом не найден" });
        return;
      }
      // уже был в этом доме: возвращаем на своё место
      for (const role of ROLES) {
        const p = house.players[role];
        if (p && p.id === playerId) {
          attach(ws, code, role);
          return;
        }
      }
      // иначе занимаем свободную роль
      const free = ROLES.find((r) => !house.players[r]);
      if (!free) {
        send(ws, { type: "error", text: "В этом доме уже двое" });
        return;
      }
      house.players[free] = makePlayer(playerId, free, msg.name);
      saveSoon();
      attach(ws, code, free);
      return;
    }

    if (msg.type === "move") {
      if (!ws.house || !houses[ws.house]) return;
      const p = houses[ws.house].players[ws.role];
      if (!p) return;
      const x = Number(msg.x);
      const y = Number(msg.y);
      if (!isFinite(x) || !isFinite(y)) return;
      p.x = Math.min(19.5, Math.max(0.5, x));
      p.y = Math.min(13.5, Math.max(0.5, y));
      if (["up", "down", "left", "right"].includes(msg.facing)) {
        p.facing = msg.facing;
      }
      saveSoon();
      broadcast(ws.house);
      return;
    }
    // сообщения "ping" просто держат связь живой
  });

  ws.on("close", () => {
    const code = ws.house;
    if (code && live[code] && live[code][ws.role] === ws) {
      delete live[code][ws.role];
      broadcast(code);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("TamoLove запущен на порту " + PORT);
});
