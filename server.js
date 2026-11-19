const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ---------- Хранение домов ----------
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "houses.json");
let houses = {};
let pool = null;
let storageInfo = "файл (база не подключена, данные могут пропасть)";

// Достаём чистую ссылку, даже если скопировалось лишнее (psql '...' и т.п.)
function cleanDbUrl(raw) {
  const m = String(raw).match(/postgres(?:ql)?:\/\/[^\s'"]+/);
  let url = m ? m[0] : String(raw).trim();
  try {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    url = u.toString();
  } catch (e) {}
  return url;
}

async function initStorage() {
  if (process.env.DATABASE_URL) {
    try {
      pool = new Pool({
        connectionString: cleanDbUrl(process.env.DATABASE_URL),
        ssl: { rejectUnauthorized: false },
        max: 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000
      });
      pool.on("error", (e) => console.log("Ошибка соединения с базой:", e.message));
      await pool.query(
        "CREATE TABLE IF NOT EXISTS houses (" +
          "code TEXT PRIMARY KEY, " +
          "data JSONB NOT NULL, " +
          "updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
      );
      const res = await pool.query("SELECT code, data FROM houses");
      for (const row of res.rows) houses[row.code] = row.data;
      storageInfo = "база данных подключена, домов загружено: " + res.rows.length;
      console.log("Хранилище:", storageInfo);
      return;
    } catch (e) {
      console.log("Не удалось подключиться к базе:", e.message);
      storageInfo = "ОШИБКА базы: " + String(e.message).slice(0, 200) + " (работаем без неё)";
      pool = null;
    }
  }
  try {
    houses = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    houses = {};
  }
}

async function saveHouse(code) {
  const house = houses[code];
  if (!house) return;
  if (pool) {
    await pool.query(
      "INSERT INTO houses (code, data, updated_at) VALUES ($1, $2::jsonb, now()) " +
        "ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [code, JSON.stringify(house)]
    );
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(houses));
  }
}

// Сохраняем не каждую секунду, а пачками (так база успевает отдыхать)
const dirty = new Set();
let flushTimer = null;
let flushAt = 0;

function markDirty(code, urgent) {
  dirty.add(code);
  const delay = urgent ? 1500 : 20000;
  const at = Date.now() + delay;
  if (flushTimer && flushAt <= at) return;
  clearTimeout(flushTimer);
  flushAt = at;
  flushTimer = setTimeout(flush, delay);
}

async function flush() {
  flushTimer = null;
  const codes = Array.from(dirty);
  dirty.clear();
  for (const code of codes) {
    try {
      await saveHouse(code);
    } catch (e) {
      console.log("Не удалось сохранить дом " + code + ":", e.message);
      markDirty(code, false);
    }
  }
}

process.on("SIGTERM", async () => {
  for (const code of Object.keys(live)) {
    if (anyLive(code)) dirty.add(code);
  }
  try {
    await flush();
  } catch (e) {}
  process.exit(0);
});

app.get("/status", (req, res) => {
  res
    .type("text/plain; charset=utf-8")
    .send(
      "TamoLove работает.\nХранилище: " +
        storageInfo +
        "\nДомов: " +
        Object.keys(houses).length
    );
});

// Кто сейчас подключён (хранится только в памяти)
const live = {};

function anyLive(code) {
  return !!(live[code] && (live[code].caregiver || live[code].receiver));
}

const ROLES = ["caregiver", "receiver"];
const SPAWN = {
  caregiver: { x: 12.5, y: 2.5 },
  receiver: { x: 16.5, y: 2.5 }
};
const DEFAULT_NAMES = { caregiver: "Ведущий", receiver: "Ведомый" };

// ---------- Правила игры (можно менять числа) ----------
const TICK_SECONDS = 5;       // как часто сервер пересчитывает показатели
const OFFLINE_FACTOR = 0.2;   // во сне (не в сети) всё падает в 5 раз медленнее
const FLOOR = 25;             // за долгое отсутствие показатели не упадут ниже
const RATE = {                // падение в секунду, когда игрок в сети
  satiety: 0.12,
  energy: 0.08,
  clean: 0.05
};
const REACH = 1.3;            // как близко надо подойти к предмету

// Еда по качеству блюда (1 подгорело, 2 вкусно, 3 шедевр)
const FOOD_BOWL = [0, 35, 50, 65];    // сколько еды попадёт в миску
const FOOD_FEED = [0, 20, 30, 40];    // сколько сытости при кормлении с рук
const FOOD_MOOD = [0, 1, 4, 8];       // бонус к настроению при кормлении
const COOK_COINS = [0, 1, 2, 3];      // монеты за готовку
const COOK_TEXT = [
  "",
  "Немного подгорело 😅 Но есть можно!",
  "Вкусно получилось! 😋",
  "Шедевр! Просто пальчики оближешь 🌟"
];

// Места, где можно что-то делать (в клетках)
const ZONES = {
  stove: [{ x: 5, y: 1, w: 1, h: 1 }],
  bowl: [{ x: 7, y: 5, w: 1, h: 1 }],
  bed: [{ x: 1, y: 9, w: 3, h: 2 }],
  clean: [{ x: 17, y: 10, w: 1, h: 1 }, { x: 16, y: 12, w: 2, h: 1 }]
};

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}

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

function ensureHouse(house) {
  if (typeof house.clean !== "number") house.clean = 80;
  if (typeof house.bowl !== "number") house.bowl = 0;
  if (typeof house.coins !== "number") house.coins = 0;
  if (typeof house.lastSeen !== "number") house.lastSeen = Date.now();
  for (const role of ROLES) {
    const p = house.players[role];
    if (!p) continue;
    if (typeof p.satiety !== "number") p.satiety = 80;
    if (typeof p.energy !== "number") p.energy = 80;
    if (typeof p.mood !== "number") p.mood = 80;
    if (![1, 2, 3].includes(p.tier)) p.tier = 2;
    p.carrying = !!p.carrying;
  }
}

// Пока в доме никого не было, все «спали»: считаем медленное падение
function slowDecay(value, amount) {
  return Math.max(value - amount, Math.min(value, FLOOR));
}

function catchUp(house) {
  const now = Date.now();
  const seconds = Math.min(2 * 86400, Math.max(0, (now - (house.lastSeen || now)) / 1000));
  house.lastSeen = now;
  if (seconds < 30) return;
  const f = OFFLINE_FACTOR * seconds;
  for (const role of ROLES) {
    const p = house.players[role];
    if (!p) continue;
    p.satiety = slowDecay(p.satiety, RATE.satiety * f);
    p.energy = slowDecay(p.energy, RATE.energy * f);
    p.mood = slowDecay(p.mood, 0.01 * f);
  }
  house.clean = slowDecay(house.clean, RATE.clean * f);
}

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
    facing: "down",
    satiety: 80,
    energy: 80,
    mood: 80,
    carrying: false,
    tier: 2
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
        online: !!(live[code] && live[code][role]),
        satiety: Math.round(p.satiety),
        energy: Math.round(p.energy),
        mood: Math.round(p.mood),
        carrying: p.carrying
      };
    }
  }
  return {
    type: "state",
    code,
    players,
    house: {
      clean: Math.round(house.clean),
      bowl: Math.round(house.bowl),
      coins: Math.round(house.coins)
    }
  };
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
  if (!anyLive(code)) catchUp(houses[code]);
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

// ---------- Действия ----------
function doAction(house, role) {
  const p = house.players[role];
  const other = house.players[role === "caregiver" ? "receiver" : "caregiver"];

  if (role === "caregiver") {
    if (near(p, "stove")) {
      // пока мини-игры нет в приложении, готовим по-старому (потом это уберём)
      if (p.carrying) return "Ты уже несёшь еду. Отнеси её в миску";
      p.carrying = true;
      p.tier = 2;
      return "Еда готова! 🍲 Неси её к миске или покорми любимого";
    }
    if (near(p, "bowl")) {
      if (!p.carrying) return "Сначала приготовь еду на плите";
      house.bowl = clamp(house.bowl + FOOD_BOWL[p.tier]);
      p.carrying = false;
      return "Миска наполнена 🥣";
    }
    if (p.carrying && other && dist(p, other) < 1.8) {
      other.satiety = clamp(other.satiety + FOOD_FEED[p.tier]);
      other.mood = clamp(other.mood + FOOD_MOOD[p.tier] + 3);
      p.mood = clamp(p.mood + 3);
      p.carrying = false;
      return "Накормлено! ❤️";
    }
  }

  if (role === "receiver" && near(p, "bowl")) {
    if (house.bowl < 25) return "В миске пусто. Попроси приготовить еду";
    house.bowl = clamp(house.bowl - 25);
    p.satiety = clamp(p.satiety + 25);
    p.mood = clamp(p.mood + 3);
    return "Ням-ням! 😋";
  }

  if (near(p, "bed")) {
    p.energy = clamp(p.energy + 12);
    p.mood = clamp(p.mood + 1);
    return "Отдых 💤";
  }

  if (near(p, "clean")) {
    // пока мини-игры нет в приложении, убираем по-старому (потом это уберём)
    house.clean = clamp(house.clean + (role === "caregiver" ? 8 : 4));
    p.mood = clamp(p.mood + 1);
    return "Стало чище ✨";
  }

  return "Здесь пока нечего делать";
}

// Готовка: игрок прошёл мини-игру и прислал результат (0-100)
function doCook(house, role, score) {
  const p = house.players[role];
  if (role !== "caregiver") return "Готовит Ведущий 🍳";
  if (!near(p, "stove")) return "Подойди к плите";
  if (p.carrying) return "Ты уже несёшь еду. Отнеси её в миску";
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const tier = s >= 80 ? 3 : s >= 50 ? 2 : 1;
  p.carrying = true;
  p.tier = tier;
  house.coins += COOK_COINS[tier];
  return COOK_TEXT[tier] + " +" + COOK_COINS[tier] + " 🪙";
}

// Уборка: игрок оттёр пятна (0-8)
function doClean(house, role, spots) {
  const p = house.players[role];
  if (!near(p, "clean")) return "Подойди к ведру или стиральной машине";
  const n = Math.max(0, Math.min(8, Math.floor(Number(spots) || 0)));
  if (n === 0) return "Ничего не удалось оттереть, попробуй ещё раз";
  const gain = n * 3 * (role === "caregiver" ? 1 : 0.6);
  house.clean = clamp(house.clean + gain);
  const coins = n >= 6 ? 2 : n >= 3 ? 1 : 0;
  house.coins += coins;
  if (n >= 3) p.mood = clamp(p.mood + 1);
  return (n >= 6 ? "Блестит! ✨" : "Стало чище ✨") + (coins ? " +" + coins + " 🪙" : "");
}

// ---------- Время идёт ----------
setInterval(() => {
  for (const code of Object.keys(live)) {
    const house = houses[code];
    if (!house || !anyLive(code)) continue;
    let onlineCount = 0;
    for (const role of ROLES) {
      const p = house.players[role];
      if (!p) continue;
      const online = !!live[code][role];
      if (online) onlineCount++;
      const f = (online ? 1 : OFFLINE_FACTOR) * TICK_SECONDS;
      p.satiety = clamp(p.satiety - RATE.satiety * f);
      p.energy = clamp(p.energy - RATE.energy * f);

      const low = p.satiety < 30 || p.energy < 30 || house.clean < 30;
      const good = p.satiety > 50 && p.energy > 50 && house.clean > 50;
      if (low) p.mood = clamp(p.mood - 0.06 * f);
      else if (good) p.mood = clamp(p.mood + 0.03 * f);
      else p.mood = clamp(p.mood - 0.01 * f);
    }
    house.clean = clamp(house.clean - RATE.clean * TICK_SECONDS);
    house.lastSeen = Date.now();
    markDirty(code, false);
    broadcast(code);
  }
}, TICK_SECONDS * 1000);

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
      houses[code] = { code, players: {}, clean: 80, bowl: 0, coins: 0, lastSeen: Date.now() };
      houses[code].players[msg.role] = makePlayer(playerId, msg.role, msg.name);
      markDirty(code, true);
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
      for (const role of ROLES) {
        const p = house.players[role];
        if (p && p.id === playerId) {
          attach(ws, code, role);
          return;
        }
      }
      const free = ROLES.find((r) => !house.players[r]);
      if (!free) {
        send(ws, { type: "error", text: "В этом доме уже двое" });
        return;
      }
      house.players[free] = makePlayer(playerId, free, msg.name);
      markDirty(code, true);
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
      broadcast(ws.house);
      return;
    }

    if (msg.type === "act" || msg.type === "cook" || msg.type === "clean") {
      const code = ws.house;
      if (!code || !houses[code]) return;
      const house = houses[code];
      if (!house.players[ws.role]) return;
      const now = Date.now();
      const gap = msg.type === "act" ? 500 : 3000;
      if (now - (ws.lastAct || 0) < gap) return;
      ws.lastAct = now;
      let text;
      if (msg.type === "cook") text = doCook(house, ws.role, msg.score);
      else if (msg.type === "clean") text = doClean(house, ws.role, msg.spots);
      else text = doAction(house, ws.role);
      send(ws, { type: "toast", text });
      markDirty(code, false);
      broadcast(code);
      return;
    }
    // сообщения "ping" просто держат связь живой
  });

  ws.on("close", () => {
    const code = ws.house;
    if (code && live[code] && live[code][ws.role] === ws) {
      delete live[code][ws.role];
      if (houses[code]) {
        if (!anyLive(code)) houses[code].lastSeen = Date.now();
        markDirty(code, true);
      }
      broadcast(code);
    }
  });
});

// ---------- Запуск ----------
async function start() {
  await initStorage();
  for (const code of Object.keys(houses)) ensureHouse(houses[code]);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log("TamoLove запущен на порту " + PORT);
  });
}
start();
