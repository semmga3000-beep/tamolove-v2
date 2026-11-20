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
  satiety: 100 / (12 * 3600), // с полного до нуля примерно за 12 часов в сети
  energy: 100 / (18 * 3600),  // примерно за 18 часов
  clean: 100 / (24 * 3600)    // дом пачкается примерно за сутки
};
const MOOD_SCALE = 0.02;        // настроение меняется медленнее в том же духе
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
  table: [{ x: 3, y: 4, w: 4, h: 2 }],
  bed: [{ x: 1, y: 9, w: 3, h: 2 }],
  clean: [{ x: 17, y: 10, w: 1, h: 1 }, { x: 16, y: 12, w: 2, h: 1 }]
};

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}

const ZONES2 = {
  stove: [{ x: 5, y: 7, w: 1, h: 1 }],
  bowl: [{ x: 6, y: 11, w: 1, h: 1 }],
  table: [{ x: 2, y: 10, w: 4, h: 2 }],
  bed: [{ x: 1, y: 1, w: 3, h: 2 }],
  clean: [{ x: 16, y: 3, w: 3, h: 1 }]
};
const SPAWN2 = { caregiver: { x: 10.5, y: 3.5 }, receiver: { x: 12.5, y: 3.5 } };
const GAMEITEMS = {
  0: [
    { zone: "stove", key: "stove_5_1", x: 5, y: 1, w: 1, h: 1 },
    { zone: "bowl", key: "bowl_7_5", x: 7, y: 5, w: 1, h: 1 },
    { zone: "table", key: "table_4_4", x: 4, y: 4, w: 2, h: 2 },
    { zone: "bed", key: "bed_1_9", x: 1, y: 9, w: 3, h: 2 },
    { zone: "clean", key: "bucket_17_10", x: 17, y: 10, w: 1, h: 1 },
    { zone: "clean", key: "washer_16_12", x: 16, y: 12, w: 1, h: 1 },
    { zone: "clean", key: "basket_17_12", x: 17, y: 12, w: 1, h: 1 }
  ],
  2: [
    { zone: "stove", key: "q_stove_5_7", x: 5, y: 7, w: 1, h: 1 },
    { zone: "bowl", key: "q_bowl_6_11", x: 6, y: 11, w: 1, h: 1 },
    { zone: "table", key: "q_table_3_10", x: 3, y: 10, w: 2, h: 2 },
    { zone: "bed", key: "q_bed_1_1", x: 1, y: 1, w: 3, h: 2 },
    { zone: "clean", key: "q_bucket_16_3", x: 16, y: 3, w: 1, h: 1 },
    { zone: "clean", key: "q_washer_17_3", x: 17, y: 3, w: 1, h: 1 },
    { zone: "clean", key: "q_basket_18_3", x: 18, y: 3, w: 1, h: 1 }
  ]
};
function zonesFor(h) {
  const list = GAMEITEMS[h.plan === 2 ? 2 : 0];
  const mv = h.moved || {};
  const out = { stove: [], bowl: [], table: [], bed: [], clean: [] };
  for (const g of list) {
    const m = mv[g.key];
    const x = m ? m.x : g.x, y = m ? m.y : g.y, rot = m ? m.r || 0 : 0;
    const w = rot % 2 ? g.h : g.w, hh = rot % 2 ? g.w : g.h;
    out[g.zone].push(g.zone === "table" ? { x: x - 1, y, w: w + 2, h: hh } : { x, y, w, h: hh });
  }
  return out;
}
let CUR = null; // дом, с которым сейчас работаем
function near(p, zoneName) {
  const flip = CUR && CUR.plan === 1;
  const base = CUR ? zonesFor(CUR)[zoneName] : ZONES[zoneName];
  return base.map((z) => (flip ? { x: 20 - z.x - z.w, y: z.y, w: z.w, h: z.h } : z)).some((z) => {
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
  if (!Array.isArray(house.owned)) house.owned = [];
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
    p.mood = slowDecay(p.mood, 0.01 * MOOD_SCALE * f);
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

const SHOP = { plant1: 3, plant2: 3, plant3: 3, lamp1: 4, lamp2: 4, night: 5, tvs: 6, tv: 10, arm: 7, aqua: 12, shelf: 8, pouf: 4, lamp3: 4, shower: 10, w_pink: 5, w_mint: 5, w_lav: 5, w_sun: 5, w_blue: 5, f_light: 5, f_dark: 5, f_gray: 5, f_pink: 5 };

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
        carrying: p.carrying,
        look: p.look || null,
        seen: p.seen || 0
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
      coins: Math.round(house.coins),
      owned: house.owned || [],
      plan: house.plan || 0,
      moved: house.moved || {},
      paint: house.paint || { wall: null, floor: null },
      ach: ACH.map((a) => ({ id: a.id, n: a.n, p: Math.min(a.t, statVal(house, a.s)), t: a.t, r: a.r, d: !!(house.ach && house.ach[a.id]) })),
      streak: { count: streakOf(house).count, broken: streakOf(house).broken, left: Math.max(0, 4 - streakOf(house).used) },
      quests: QUESTS.map((d) => {
        const q = qState(house);
        return { id: d.id, n: d.n, p: Math.min(d.t, q.p[d.id] || 0), t: d.t, r: d.r, d: !!q.done[d.id] };
      })
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
    send(old, { type: "kicked" });
    old.close();
  }
  live[code][role] = ws;
  ws.house = code;
  ws.role = role;
  if (houses[code]) touchStreak(houses[code]);
  send(ws, { type: "joined", code, role });
  broadcast(code);
}

// ---------- Действия ----------
function streakOf(house) {
  if (!house.streak) house.streak = { count: 0, last: 0, day: "", used: 0, week: "", broken: 0 };
  return house.streak;
}
function touchStreak(house) {
  const s = streakOf(house);
  const now = Date.now();
  const shifted = now + 5 * 3600 * 1000;
  const wk = Math.floor((shifted / 86400000 + 3) / 7);
  if (s.week !== wk) { s.week = wk; s.used = 0; }
  if (s.broken) return;
  if (s.last && now - s.last > 24 * 3600 * 1000) { s.broken = Math.max(1, s.count); return; }
  s.last = now;
  const day = new Date(shifted).toISOString().slice(0, 10);
  if (s.day !== day) {
    s.day = day;
    s.count += 1;
    const at = achCheck(house);
    if (at) notifyHouse(house, "Вы вместе уже " + s.count + " дн.!" + at);
  }
}

const QUESTS = [
  { id: "eat", n: "Съесть 5 порций 🍽️", t: 5, r: 5 },
  { id: "cook", n: "Приготовить 3 блюда 🍳", t: 3, r: 4 },
  { id: "clean", n: "Убраться 2 раза 🧹", t: 2, r: 3 },
  { id: "dance", n: "Станцевать вместе 💃", t: 1, r: 4 }
];
function today() {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function qState(house) {
  if (!house.quests || house.quests.day !== today()) house.quests = { day: today(), p: {}, done: {} };
  return house.quests;
}
const ACH = [
  { id: "eat20", n: "Гурманы: 20 порций", s: "eat", t: 20, r: 5 },
  { id: "eat100", n: "Большие гурманы: 100 порций", s: "eat", t: 100, r: 15 },
  { id: "cook10", n: "Шеф-повара: 10 блюд", s: "cook", t: 10, r: 5 },
  { id: "cook50", n: "Мастера кухни: 50 блюд", s: "cook", t: 50, r: 15 },
  { id: "perf5", n: "5 шедевров на плите", s: "perfect", t: 5, r: 8 },
  { id: "clean10", n: "Чистюли: 10 уборок", s: "clean", t: 10, r: 5 },
  { id: "clean40", n: "Блестящий дом: 40 уборок", s: "clean", t: 40, r: 12 },
  { id: "dance5", n: "Танцоры: 5 танцев", s: "dance", t: 5, r: 6 },
  { id: "dance20", n: "Звёзды танцпола: 20 танцев", s: "dance", t: 20, r: 15 },
  { id: "buy5", n: "Новосёлы: 5 покупок", s: "buy", t: 5, r: 5 },
  { id: "buy12", n: "Дизайнеры: 12 покупок", s: "buy", t: 12, r: 12 },
  { id: "str3", n: "3 дня вместе", s: "streak", t: 3, r: 3 },
  { id: "str7", n: "Неделя вместе", s: "streak", t: 7, r: 7 },
  { id: "str14", n: "Две недели вместе", s: "streak", t: 14, r: 12 },
  { id: "str30", n: "Месяц вместе", s: "streak", t: 30, r: 25 },
  { id: "look1", n: "Новый образ", s: "look", t: 1, r: 2 },
  { id: "plan1", n: "Перестроили дом", s: "plan", t: 1, r: 2 },
  { id: "paint1", n: "Свежий ремонт", s: "paint", t: 1, r: 2 }
];
function statVal(house, s) {
  return s === "streak" ? streakOf(house).count : (house.stats && house.stats[s]) || 0;
}
function achCheck(house) {
  if (!house.ach) house.ach = {};
  let out = "";
  for (const a of ACH) {
    if (!house.ach[a.id] && statVal(house, a.s) >= a.t) {
      house.ach[a.id] = true;
      house.coins += a.r;
      out += " 🏆 " + a.n + "! +" + a.r + " 🪙";
    }
  }
  return out;
}
function statAdd(house, key, n) {
  if (!house.stats) house.stats = {};
  house.stats[key] = (house.stats[key] || 0) + n;
  return achCheck(house);
}
function notifyHouse(house, text) {
  const code = Object.keys(houses).find((k) => houses[k] === house);
  if (!code || !live[code]) return;
  for (const rl of ROLES) if (live[code][rl]) send(live[code][rl], { type: "toast", text });
}
function qAdd(house, id, n) {
  const ach = statAdd(house, id, n);
  const q = qState(house);
  const d = QUESTS.find((x) => x.id === id);
  let out = "";
  if (d && !q.done[id]) {
    q.p[id] = (q.p[id] || 0) + n;
    if (q.p[id] >= d.t) {
      q.done[id] = true;
      house.coins += d.r;
      out = " 🎯 Задание выполнено! +" + d.r + " 🪙";
    }
  }
  return out + ach;
}

function finishDance(code, d) {
  const house = houses[code];
  if (!house || house.dance !== d || d.state !== "play") return;
  d.state = "done";
  const team = (d.scores.caregiver || 0) + (d.scores.receiver || 0);
  let coins = team >= 56 ? 5 : team >= 44 ? 4 : team >= 30 ? 3 : team >= 16 ? 2 : 1;
  if (house.danceAt && Date.now() - house.danceAt < 120000) coins = 0;
  house.danceAt = Date.now();
  house.coins += coins;
  for (const rl of ROLES) {
    const p = house.players[rl];
    if (p) p.mood = clamp(p.mood + 6 + Math.round(team / 8));
  }
  const q = qAdd(house, "dance", 1);
  const text = "Танец окончен! Очки " + team + "/64" + (coins ? " +" + coins + " 🪙" : " (монеты раз в 2 мин)") + q;
  for (const rl of ROLES) if (live[code] && live[code][rl]) send(live[code][rl], { type: "dance_end", text });
  markDirty(code, true);
  broadcast(code);
}

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
    // Ведущий съедает своё блюдо за столом (с левой стороны, подальше от миски)
    if (p.carrying && near(p, "table") && !near(p, "bowl")) {
      p.satiety = clamp(p.satiety + FOOD_FEED[p.tier] + 10);
      p.mood = clamp(p.mood + FOOD_MOOD[p.tier] + 2);
      p.carrying = false;
      return "Приятного аппетита! 🍽️" + qAdd(house, "eat", 1);
    }
    if (p.carrying && other && dist(p, other) < 1.8) {
      other.satiety = clamp(other.satiety + FOOD_FEED[p.tier]);
      other.mood = clamp(other.mood + FOOD_MOOD[p.tier] + 3);
      p.mood = clamp(p.mood + 3);
      p.carrying = false;
      return "Накормлено! ❤️" + qAdd(house, "eat", 1);
    }
  }

  if (role === "receiver" && near(p, "bowl")) {
    if (house.bowl < 25) return "В миске пусто. Попроси приготовить еду";
    house.bowl = clamp(house.bowl - 25);
    p.satiety = clamp(p.satiety + 25);
    p.mood = clamp(p.mood + 3);
    return "Ням-ням! 😋" + qAdd(house, "eat", 1);
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
  const perf = tier === 3 ? statAdd(house, "perfect", 1) : "";
  return COOK_TEXT[tier] + " +" + COOK_COINS[tier] + " 🪙" + qAdd(house, "cook", 1) + perf;
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
  return (n >= 6 ? "Блестит! ✨" : "Стало чище ✨") + (coins ? " +" + coins + " 🪙" : "") + (n >= 3 ? qAdd(house, "clean", 1) : "");
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
      if (low) p.mood = clamp(p.mood - 0.06 * MOOD_SCALE * f);
      else if (good) p.mood = clamp(p.mood + 0.03 * MOOD_SCALE * f);
      else p.mood = clamp(p.mood - 0.01 * MOOD_SCALE * f);
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
    CUR = ws.house && houses[ws.house] ? houses[ws.house] : null;
    if (CUR && msg.type !== "move") touchStreak(CUR);

    if (msg.type === "move_item" || msg.type === "reset_layout") {
      if (!CUR) return;
      if (msg.type === "reset_layout") CUR.moved = {};
      else {
        const id = String(msg.id || "");
        const x = Math.floor(Number(msg.x)), y = Math.floor(Number(msg.y));
        if (!/^[a-z0-9_]{1,30}$/.test(id) || !(x >= 0 && x < 20 && y >= 0 && y < 14)) return;
        if (!CUR.moved) CUR.moved = {};
        CUR.moved[id] = { x, y, r: Math.max(0, Math.min(3, Math.floor(Number(msg.r) || 0))) };
      }
      markDirty(ws.house, true);
      broadcast(ws.house);
      return;
    }

    if (msg.type === "paint") {
      if (!CUR) return;
      if (!CUR.paint) CUR.paint = { wall: null, floor: null };
      const okv = (v, pre) => v === null || (typeof v === "string" && v.startsWith(pre) && SHOP[v] !== undefined && (CUR.owned || []).includes(v));
      if (msg.wall !== undefined && okv(msg.wall, "w_")) CUR.paint.wall = msg.wall;
      if (msg.floor !== undefined && okv(msg.floor, "f_")) CUR.paint.floor = msg.floor;
      if (msg.wall || msg.floor) notifyHouse(CUR, "Свежий ремонт! 🎨" + statAdd(CUR, "paint", 1));
      markDirty(ws.house, true);
      broadcast(ws.house);
      return;
    }

    if (msg.type === "set_plan") {
      if (!CUR) return;
      const np = [0, 1, 2].includes(msg.plan) ? msg.plan : 0;
      const op = CUR.plan || 0;
      if (op === np) return;
      CUR.plan = np;
      const planAch = statAdd(CUR, "plan", 1);
      for (const rl of ROLES) {
        const pp = CUR.players[rl];
        if (!pp) continue;
        if (np === 2) { pp.x = SPAWN2[rl].x; pp.y = SPAWN2[rl].y; }
        else if (op === 2) { pp.x = np === 1 ? 20 - SPAWN[rl].x : SPAWN[rl].x; pp.y = SPAWN[rl].y; }
        else pp.x = 20 - pp.x;
      }
      for (const rl of ROLES) if (live[ws.house] && live[ws.house][rl]) send(live[ws.house][rl], { type: "toast", text: "Дом перестроен! 🏠✨" + planAch });
      markDirty(ws.house, true);
      broadcast(ws.house);
      return;
    }

    if (msg.type === "dance_invite" || msg.type === "dance_answer" || msg.type === "dance_score") {
      const code = ws.house;
      if (!code || !houses[code] || !live[code]) return;
      const house = houses[code];
      const other = ws.role === "caregiver" ? "receiver" : "caregiver";
      const osock = live[code][other];
      if (msg.type === "dance_invite") {
        if (!osock) { send(ws, { type: "toast", text: "Партнёра нет в игре 😔" }); return; }
        if (house.dance && Date.now() - house.dance.at < 60000) { send(ws, { type: "toast", text: "Танец уже идёт или ждёт ответа" }); return; }
        house.dance = { state: "invite", from: ws.role, at: Date.now(), scores: {} };
        send(osock, { type: "dance_invite", name: (house.players[ws.role] || {}).name || "Партнёр" });
        send(ws, { type: "toast", text: "Позвали танцевать 💃" });
        return;
      }
      const d = house.dance;
      if (!d) return;
      if (msg.type === "dance_answer") {
        if (d.state !== "invite" || d.from === ws.role) return;
        const inviter = live[code][d.from];
        if (!msg.ok) { if (inviter) send(inviter, { type: "toast", text: "Сейчас не хочет танцевать 😔" }); house.dance = null; return; }
        d.state = "play";
        d.at = Date.now();
        const seed = Math.floor(Math.random() * 1e9);
        for (const rl of ROLES) if (live[code][rl]) send(live[code][rl], { type: "dance_start", seed });
        setTimeout(() => finishDance(code, d), 40000);
        return;
      }
      if (msg.type === "dance_score") {
        if (d.state !== "play") return;
        d.scores[ws.role] = Math.max(0, Math.min(32, Math.floor(Number(msg.hits) || 0)));
        if (d.scores.caregiver !== undefined && d.scores.receiver !== undefined) finishDance(code, d);
        return;
      }
    }

    if (msg.type === "streak_restore" || msg.type === "streak_reset") {
      const code = ws.house;
      if (!code || !houses[code]) return;
      const s = streakOf(houses[code]);
      if (!s.broken) return;
      if (msg.type === "streak_restore") {
        if (s.used >= 4) { send(ws, { type: "toast", text: "Бесплатные восстановления на этой неделе закончились" }); return; }
        s.used += 1;
        s.broken = 0;
        s.last = Date.now();
        for (const rl of ROLES) if (live[code] && live[code][rl]) send(live[code][rl], { type: "toast", text: "Огонёк снова горит! 🔥" });
      } else {
        s.count = 0;
        s.broken = 0;
        s.last = 0;
        s.day = "";
        touchStreak(houses[code]);
      }
      markDirty(code, true);
      broadcast(code);
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

    // Ведомый просит присесть за стол к Ведущему
    if (msg.type === "ask_sit") {
      const code = ws.house;
      if (!code || !houses[code] || ws.role !== "receiver") return;
      const house = houses[code];
      const me = house.players.receiver;
      const cg = house.players.caregiver;
      const sock = live[code] && live[code].caregiver;
      if (!me || !cg) return;
      if (!near(me, "table")) { send(ws, { type: "toast", text: "Подойди к столу" }); return; }
      if (!sock || !cg.carrying || !near(cg, "table")) {
        send(ws, { type: "toast", text: "За столом сейчас нет еды" });
        return;
      }
      if (Date.now() - (house.sitAsk || 0) < 15000) {
        send(ws, { type: "toast", text: "Подожди немного, уже спросили" });
        return;
      }
      house.sitAsk = Date.now();
      send(sock, { type: "sit_request", name: me.name });
      send(ws, { type: "toast", text: "Спросили, можно ли сесть рядом 🪑" });
      return;
    }

    // Ведущий отвечает на просьбу
    if (msg.type === "sit_answer") {
      const code = ws.house;
      if (!code || !houses[code] || ws.role !== "caregiver") return;
      const house = houses[code];
      const p = house.players.caregiver;
      const rec = house.players.receiver;
      const rsock = live[code] && live[code].receiver;
      if (!house.sitAsk || Date.now() - house.sitAsk > 30000) {
        send(ws, { type: "toast", text: "Просьба уже устарела" });
        return;
      }
      house.sitAsk = 0;
      if (!msg.ok) {
        send(ws, { type: "toast", text: "Ты отказал 🙅" });
        if (rsock) send(rsock, { type: "toast", text: "Сейчас нельзя 😔" });
        return;
      }
      if (!p || !rec || !p.carrying || !near(p, "table") || !near(rec, "table")) {
        send(ws, { type: "toast", text: "Еды уже нет или Ведомый отошёл" });
        return;
      }
      const gain = FOOD_FEED[p.tier] + 10;
      p.satiety = clamp(p.satiety + gain);
      rec.satiety = clamp(rec.satiety + gain);
      p.mood = clamp(p.mood + FOOD_MOOD[p.tier] + 6);
      rec.mood = clamp(rec.mood + FOOD_MOOD[p.tier] + 6);
      p.carrying = false;
      const qt = qAdd(house, "eat", 2);
      send(ws, { type: "toast", text: "Едите вместе! Вдвоём вкуснее ❤️🍽️" + qt });
      if (rsock) send(rsock, { type: "toast", text: "Вы едите вместе! Вдвоём вкуснее ❤️🍽️" + qt });
      markDirty(code, false);
      broadcast(code);
      return;
    }

    if (msg.type === "look") {
      const code = ws.house;
      if (!code || !houses[code]) return;
      const me = houses[code].players[ws.role];
      const L = msg.look;
      if (!me || !L || typeof L !== "object") return;
      const hex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
      if (!["human", "animal", "ghost"].includes(L.type)) return;
      if (!["short", "long", "bun"].includes(L.style)) return;
      if (!hex(L.skin) || !hex(L.hair) || !hex(L.shirt) || !hex(L.pants)) return;
      me.look = { type: L.type, style: L.style, skin: L.skin, hair: L.hair, shirt: L.shirt, pants: L.pants };
      send(ws, { type: "toast", text: "Новый образ! ✨" + statAdd(houses[code], "look", 1) });
      markDirty(code, true);
      broadcast(code);
      return;
    }

    if (msg.type === "buy") {
      const code = ws.house;
      if (!code || !houses[code]) return;
      const house = houses[code];
      if (!house.players[ws.role]) return;
      if (!house.owned) house.owned = [];
      const cost = SHOP[msg.id];
      if (cost === undefined) return;
      if (msg.id === "tv" && !house.owned.includes("tvs")) { send(ws, { type: "toast", text: "Сначала нужна тумба 📺" }); return; }
      if (house.owned.includes(msg.id)) { send(ws, { type: "toast", text: "Это уже куплено ✅" }); return; }
      if (house.coins < cost) { send(ws, { type: "toast", text: "Не хватает монет 🪙" }); return; }
      house.coins -= cost;
      house.owned.push(msg.id);
      const buyAch = statAdd(house, "buy", 1);
      for (const rl of ROLES) {
        if (live[code] && live[code][rl]) send(live[code][rl], { type: "toast", text: "Новая вещь в доме! 🛋️✨" + buyAch });
      }
      markDirty(code, true);
      broadcast(code);
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
        const pl = houses[code].players[ws.role];
        if (pl) pl.seen = Date.now();
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
