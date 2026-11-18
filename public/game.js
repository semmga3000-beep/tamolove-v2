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

// =====================================================================
//  ДОМ: данные (планировка, мебель, места для действий)
// =====================================================================
const T = 16;

const LAYOUT = {
  id: "cabin",
  name: "Уютный домик",
  // # стена, d проём, k кухня, l гостиная, b спальня, c зона уборки
  map: [
    "####################",
    "#kkkkkkkkk#llllllll#",
    "#kkkkkkkkk#llllllll#",
    "#kkkkkkkkkdllllllll#",
    "#kkkkkkkkk#llllllll#",
    "#kkkkkkkkk#llllllll#",
    "#kkkkkkkkk#llllllll#",
    "####d#########d#####",
    "#bbbbbbbbb#cccccccc#",
    "#bbbbbbbbb#cccccccc#",
    "#bbbbbbbbbdcccccccc#",
    "#bbbbbbbbb#cccccccc#",
    "#bbbbbbbbb#cccccccc#",
    "####################"
  ],
  rooms: { k: "Кухня", l: "Гостиная", b: "Спальня", c: "Зона уборки" },
  spawn: {
    caregiver: { x: 12.5, y: 2.5 },
    receiver: { x: 16.5, y: 2.5 }
  },
  // Те же места, что и на сервере (менять только вместе с сервером)
  zones: {
    stove: [{ x: 5, y: 1, w: 1, h: 1 }],
    bowl: [{ x: 7, y: 5, w: 1, h: 1 }],
    bed: [{ x: 1, y: 9, w: 3, h: 2 }],
    clean: [{ x: 17, y: 10, w: 1, h: 1 }, { x: 16, y: 12, w: 2, h: 1 }]
  },
  // Ковры лежат на полу
  rugs: [
    { x: 3, y: 3, w: 4, h: 4, border: "#3f6b3f", body: "#4f8a4f", inner: "#5b9a58" },
    { x: 12, y: 2, w: 6, h: 3, border: "#e0bf8a", body: "#a23f3f", inner: "#b04a48" },
    { x: 4, y: 10, w: 4, h: 2, border: "#cdb0df", body: "#a98ac6", inner: "#b79bd1" },
    { x: 13, y: 10, w: 3, h: 2, border: "#a3c7da", body: "#7fb0c9", inner: "#8dbcd3" }
  ],
  // Украшения на стенах
  decor: [
    { t: "window", x: 2, y: 0, w: 2 },
    { t: "shelf", x: 7, y: 0, w: 2 },
    { t: "picture", x: 14, y: 0, w: 1 },
    { t: "window", x: 17, y: 0, w: 2 },
    { t: "window", x: 5, y: 7, w: 2 },
    { t: "picture", x: 9, y: 7, w: 1 },
    { t: "shelf", x: 12, y: 7, w: 2 },
    { t: "window", x: 16, y: 7, w: 2 }
  ],
  // Мебель
  items: [
    // Кухня
    { t: "counter", x: 1, y: 1, w: 2 },
    { t: "sink", x: 3, y: 1 },
    { t: "counter", x: 4, y: 1 },
    { t: "stove", x: 5, y: 1 },
    { t: "fridge", x: 6, y: 1 },
    { t: "counter", x: 7, y: 1 },
    { t: "plant", x: 8, y: 1 },
    { t: "table", x: 4, y: 4, w: 2, h: 2 },
    { t: "chair", x: 3, y: 4, dir: "right" },
    { t: "chair", x: 3, y: 5, dir: "right" },
    { t: "chair", x: 6, y: 4, dir: "left" },
    { t: "chair", x: 6, y: 5, dir: "left" },
    { t: "bowl", x: 7, y: 5, solid: false },
    // Гостиная
    { t: "lamp", x: 11, y: 1 },
    { t: "bookshelf", x: 12, y: 1, w: 2 },
    { t: "fireplace", x: 15, y: 1, w: 2 },
    { t: "plant", x: 18, y: 1 },
    { t: "coffeetable", x: 14, y: 3, w: 2 },
    { t: "sofa", x: 13, y: 5, w: 4 },
    // Спальня
    { t: "bed", x: 1, y: 9, w: 3, h: 2 },
    { t: "nightstand", x: 4, y: 9 },
    { t: "wardrobe", x: 7, y: 8, w: 2 },
    { t: "dresser", x: 6, y: 12, w: 2 },
    { t: "plant", x: 9, y: 12 },
    // Зона уборки
    { t: "cabinet", x: 12, y: 8, w: 2 },
    { t: "plant", x: 18, y: 8 },
    { t: "bucket", x: 17, y: 10 },
    { t: "washer", x: 16, y: 12 },
    { t: "basket", x: 17, y: 12 },
    { t: "plant", x: 11, y: 12 }
  ]
};

for (const it of LAYOUT.items) {
  if (!it.w) it.w = 1;
  if (!it.h) it.h = 1;
  if (it.solid === undefined) it.solid = true;
}

const COLS = LAYOUT.map[0].length;
const ROWS = LAYOUT.map.length;
const ZONES = LAYOUT.zones;
const roleNames = { caregiver: "Ведущий", receiver: "Ведомый" };

canvas.width = COLS * T;
canvas.height = ROWS * T;
ctx.imageSmoothingEnabled = false;

function tileAt(tx, ty) {
  if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return "#";
  return LAYOUT.map[ty][tx];
}
function isWall(tx, ty) {
  return tileAt(tx, ty) === "#";
}

function near(p, zoneName) {
  return ZONES[zoneName].some((z) => {
    const dx = Math.max(z.x - p.x, 0, p.x - (z.x + z.w));
    const dy = Math.max(z.y - p.y, 0, p.y - (z.y + z.h));
    return Math.hypot(dx, dy) <= 1.3;
  });
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// =====================================================================
//  РИСОВАНИЕ: пол, стены, мебель (всё рисуется кодом)
// =====================================================================
// ---------- Стили квартиры: замена цветов ----------
const THEMES = {
  cabin: {
    name: "Тёмное дерево",
    frame: ["#b9824f", "#8a5a34", "#4d2f1a"],
    map: {}
  },
  pastel: {
    name: "Пастель",
    frame: ["#f4b6cb", "#d98aa8", "#8c4a68"],
    map: {
      "#c98d55": "#f1dfbf", "#a96f3c": "#dcc59c", "#d89c63": "#f8ebd2",
      "#d8ab7a": "#f3e3cc", "#bd8b5c": "#e0c9a8", "#e5bd8f": "#faf0e0",
      "#a97240": "#e6cfa6", "#8a572b": "#cfb487", "#bb834f": "#f1ddb9",
      "#ecdcb8": "#f6ecd9", "#e2cfa5": "#eadfc6", "#cdb98f": "#d8c9a8",
      "#d6e8f0": "#e4f1f6", "#cbe0ea": "#d8eaf2", "#a9c5d3": "#bcd6e2",
      "#f1e0b2": "#dbeaf6", "#e6d19c": "#c6dbee",
      "#ebd2a8": "#e6e0f6", "#dfc194": "#d3cbee",
      "#f0cfcf": "#f8dfe8", "#e4bcbc": "#efc9d8",
      "#cde3ec": "#d6eee6", "#b9d4e0": "#c0e0d6",
      "#5b3720": "#8fa8cc", "#86542f": "#b6c9e4", "#7b4a2b": "#e8c9a0", "#9a6338": "#f4dcb8",
      "#6b4226": "#c9a67a", "#8a5a34": "#dfc298", "#4d2f1a": "#a68355", "#58341f": "#b58f63",
      "#3f6b3f": "#e88fae", "#4f8a4f": "#f4b3c8", "#5b9a58": "#f8c8d8",
      "#e0bf8a": "#ffe9b8", "#a23f3f": "#f7c8d8", "#b04a48": "#fbd9e4",
      "#a8703f": "#7fb0d6", "#8a5a30": "#5f93bd", "#7c4f2a": "#4f82ab",
      "#e6c690": "#f4f1ec", "#f5deb0": "#ffffff", "#f3dcae": "#f2a65a",
      "#2f5490": "#a98ac6", "#3d6bb0": "#c0a3d8", "#5b88cc": "#d6c0e8",
      "#2a4a80": "#8b6aab", "#34609f": "#b393d0",
      "#e0839c": "#8cc3e8", "#f0a9bb": "#b4daf3", "#cf7189": "#6fa9d2",
      "#9a6a35": "#e8d3b0", "#c18a4a": "#f3e4c8",
      "#5b80c0": "#f09ab4", "#7da0d8": "#f7bccf",
      "#b57a45": "#b58fd6", "#a36b38": "#f0e0d0", "#c28850": "#fff3e6",
      "#b9803f": "#f3e4c8", "#d8a060": "#fff3e0", "#d0975e": "#fff3e0",
      "#5f8fa8": "#f2a0bb", "#82b0c6": "#f8bfd1", "#476e82": "#d4809e",
      "#7fbf7f": "#f6b6cb", "#6aa86a": "#e898b2"
    }
  },
  anime: {
    name: "Светлый дом",
    frame: ["#f2d29a", "#d9a96c", "#8a5a2a"],
    map: {
      "#c98d55": "#ecc590", "#a96f3c": "#d9a96c", "#d89c63": "#f4d6a8",
      "#d8ab7a": "#f1cfc0", "#bd8b5c": "#e0b8a6", "#e5bd8f": "#f8e0d4",
      "#a97240": "#dcae78", "#8a572b": "#c28f58", "#bb834f": "#e8c08c",
      "#ecdcb8": "#f5efe2", "#e2cfa5": "#eae1cf", "#cdb98f": "#d8cdb6",
      "#d6e8f0": "#f6e4ea", "#cbe0ea": "#efd6df", "#a9c5d3": "#dcbfca",
      "#f1e0b2": "#fbf0cf", "#e6d19c": "#f0e0b4",
      "#ebd2a8": "#fbefd0", "#dfc194": "#f0deb4",
      "#f0cfcf": "#f9e1e6", "#e4bcbc": "#efc8d2",
      "#cde3ec": "#d7edf2", "#b9d4e0": "#bfdce5",
      "#5b3720": "#b9824f", "#86542f": "#d49d68", "#7b4a2b": "#c38a58", "#9a6338": "#dcab78",
      "#6b4226": "#c88a55", "#8a5a34": "#dda26b", "#4d2f1a": "#a96e3f", "#58341f": "#b8793f",
      "#3f6b3f": "#f0e4d0", "#4f8a4f": "#fffaf0", "#5b9a58": "#fff6e6",
      "#e0bf8a": "#ffe3b0", "#a23f3f": "#f2b8b0", "#b04a48": "#f7c9c2",
      "#cdb0df": "#f4c6d4", "#a98ac6": "#f8dce6", "#b79bd1": "#fbe8ef",
      "#2f5490": "#e8e4de", "#3d6bb0": "#faf8f4", "#5b88cc": "#ffffff",
      "#2a4a80": "#cfc9c0", "#34609f": "#f0ece6",
      "#5f8fa8": "#8fcfb8", "#82b0c6": "#b5e4d2", "#476e82": "#6fb39b",
      "#5b80c0": "#fdf6ee", "#7da0d8": "#f4d6d0",
      "#7fbf7f": "#fff3e6", "#6aa86a": "#f0dcc4",
      "#a8703f": "#d9a26a", "#e6c690": "#f6dcae"
    }
  }
};
const THEME_ORDER = ["cabin", "pastel", "anime"];
let theme = THEMES.cabin;

let g = ctx;       // куда сейчас рисуем (экран или фон)
let curNow = 0;    // время для анимации
let bowlLevel = 0; // сколько еды в миске

function r(x, y, w, h, c) {
  g.fillStyle = (theme.map && theme.map[c]) || c;
  g.fillRect(x, y, w, h);
}

// ---- Пол ----
function drawFloorTile(tx, ty, c) {
  const x = tx * T;
  const y = ty * T;
  if (c === "k") {
    r(x, y, T, T, (tx + ty) % 2 === 0 ? "#ecdcb8" : "#e2cfa5");
    r(x, y + T - 1, T, 1, "#cdb98f");
    r(x + T - 1, y, 1, T, "#cdb98f");
  } else if (c === "c") {
    r(x, y, T, T, (tx + ty) % 2 === 0 ? "#d6e8f0" : "#cbe0ea");
    r(x, y + 7, T, 1, "#a9c5d3");
    r(x, y + 15, T, 1, "#a9c5d3");
    r(x + 7, y, 1, T, "#a9c5d3");
    r(x + 15, y, 1, T, "#a9c5d3");
  } else {
    let base = "#c98d55";
    let dark = "#a96f3c";
    let light = "#d89c63";
    if (c === "b") { base = "#d8ab7a"; dark = "#bd8b5c"; light = "#e5bd8f"; }
    if (c === "d") { base = "#a97240"; dark = "#8a572b"; light = "#bb834f"; }
    r(x, y, T, T, base);
    r(x, y, T, 1, dark);
    r(x, y + 8, T, 1, dark);
    r(x, y + 1, T, 1, light);
    r(x, y + 9, T, 1, light);
    const s1 = ((tx * 5 + ty * 3) % 14) + 1;
    const s2 = ((tx * 3 + ty * 7 + 5) % 14) + 1;
    r(x + s1, y + 1, 1, 7, dark);
    r(x + s2, y + 9, 1, 7, dark);
  }
}

// ---- Стены ----
function wallpaperFor(tx, ty) {
  const cands = [tileAt(tx, ty + 1), tileAt(tx - 1, ty + 1), tileAt(tx + 1, ty + 1)];
  let room = "k";
  for (const ch of cands) {
    if (ch !== "#" && ch !== "d") { room = ch; break; }
  }
  if (room === "k") return ["#f1e0b2", "#e6d19c"];
  if (room === "l") return ["#ebd2a8", "#dfc194"];
  if (room === "b") return ["#f0cfcf", "#e4bcbc"];
  return ["#cde3ec", "#b9d4e0"];
}

function drawWallTile(tx, ty) {
  const x = tx * T;
  const y = ty * T;
  if (tileAt(tx, ty + 1) !== "#") {
    const wp = wallpaperFor(tx, ty);
    r(x, y, T, T, wp[0]);
    r(x + 1, y, 1, T, wp[1]);
    r(x + 5, y, 1, T, wp[1]);
    r(x + 9, y, 1, T, wp[1]);
    r(x + 13, y, 1, T, wp[1]);
    r(x, y, T, 3, "#5b3720");
    r(x, y, T, 1, "#86542f");
    r(x, y + T - 4, T, 4, "#7b4a2b");
    r(x, y + T - 4, T, 1, "#9a6338");
  } else {
    r(x, y, T, T, "#6b4226");
    r(x, y, T, 2, "#8a5a34");
    r(x, y + T - 2, T, 2, "#4d2f1a");
    r(x + 3 + (ty % 2) * 6, y + 6, 6, 1, "#58341f");
    r(x + 6 - (ty % 2) * 4, y + 10, 5, 1, "#58341f");
  }
}

// ---- Ковры ----
function drawRug(ru) {
  const x = ru.x * T;
  const y = ru.y * T;
  const w = ru.w * T;
  const h = ru.h * T;
  r(x, y, w, h, ru.border);
  r(x + 2, y + 2, w - 4, h - 4, ru.body);
  r(x + 4, y + 4, w - 8, h - 8, ru.inner);
  r(x + 6, y + 6, w - 12, 1, ru.border);
  r(x + 6, y + h - 7, w - 12, 1, ru.border);
  // бахрома
  for (let i = 3; i < h - 3; i += 4) {
    r(x - 1, y + i, 1, 2, ru.border);
    r(x + w, y + i, 1, 2, ru.border);
  }
}

// ---- Украшения на стенах ----
const DEC = {};
DEC.window = (x, y, w) => {
  const W = w * 16;
  r(x - 1, y + 1, W + 2, 2, "#8a5a2c");
  r(x + 2, y + 2, W - 4, 10, "#7a4a2a");
  r(x + 3, y + 3, W - 6, 8, "#a9d6f0");
  r(x + 3, y + 3, W - 6, 3, "#c4e6f7");
  r(x + Math.floor(W / 2) - 1, y + 3, 1, 8, "#7a4a2a");
  r(x + 3, y + 7, W - 6, 1, "#7a4a2a");
  r(x + 1, y + 11, W - 2, 2, "#9a6338");
  r(x, y + 1, 4, 11, "#7fbf7f");
  r(x + W - 4, y + 1, 4, 11, "#7fbf7f");
  r(x + 1, y + 1, 1, 11, "#6aa86a");
  r(x + W - 3, y + 1, 1, 11, "#6aa86a");
};
DEC.picture = (x, y) => {
  r(x + 3, y + 2, 10, 8, "#7a4a2a");
  r(x + 4, y + 3, 8, 6, "#8fc7e8");
  r(x + 4, y + 7, 8, 2, "#5fa05a");
  r(x + 9, y + 4, 2, 2, "#ffe27a");
};
DEC.shelf = (x, y, w) => {
  const W = w * 16;
  r(x + 1, y + 9, W - 2, 2, "#7a4a2a");
  r(x + 1, y + 11, W - 2, 1, "#5b3720");
  r(x + 3, y + 4, 4, 5, "#8fd0e8");
  r(x + 9, y + 5, 4, 4, "#e5b567");
  r(x + 15, y + 3, 5, 6, "#e58fa6");
  if (W > 24) r(x + 22, y + 5, 4, 4, "#8fd0e8");
};

// ---- Мебель ----
const SPR = {};

SPR.counter = (x, y, wc) => {
  const w = wc * 16;
  r(x, y, w, 10, "#e6c690");
  r(x, y, w, 1, "#f5deb0");
  r(x, y + 10, w, 6, "#a8703f");
  r(x, y + 10, w, 1, "#8a5a30");
  for (let i = 0; i < w / 16; i++) {
    r(x + i * 16 + 15, y + 10, 1, 6, "#7c4f2a");
    r(x + i * 16 + 11, y + 12, 3, 2, "#f3dcae");
  }
};
SPR.sink = (x, y) => {
  SPR.counter(x, y, 1);
  r(x + 3, y + 2, 10, 6, "#9fbccb");
  r(x + 4, y + 3, 8, 4, "#6f93a6");
  r(x + 7, y - 1, 2, 4, "#cfd6db");
  r(x + 7, y - 1, 5, 1, "#cfd6db");
};
SPR.stove = (x, y) => {
  r(x, y, 16, 10, "#7d8189");
  r(x, y, 16, 1, "#a1a5ac");
  r(x + 2, y + 2, 5, 5, "#2f3237");
  r(x + 3, y + 3, 3, 3, "#44484f");
  r(x + 9, y + 2, 5, 5, "#2f3237");
  r(x + 10, y + 3, 3, 3, "#44484f");
  r(x, y + 10, 16, 6, "#b4b8be");
  r(x, y + 10, 16, 1, "#8d9198");
  r(x + 2, y + 11, 12, 4, "#2b2e33");
  r(x + 3, y + 12, 10, 1, "#55595f");
};
SPR.fridge = (x, y) => {
  r(x + 1, y - 14, 14, 30, "#cfd8de");
  r(x + 1, y - 14, 14, 1, "#eef2f5");
  r(x + 1, y - 14, 1, 30, "#e3e9ed");
  r(x + 14, y - 14, 1, 30, "#9aa6af");
  r(x + 1, y - 3, 14, 1, "#8b979f");
  r(x + 11, y - 11, 2, 6, "#7d8991");
  r(x + 11, y, 2, 8, "#7d8991");
  r(x + 3, y - 9, 4, 4, "#e58fa6");
  r(x + 5, y + 1, 3, 3, "#ffe27a");
  r(x + 1, y + 15, 14, 1, "#6b767e");
};
SPR.plant = (x, y) => {
  r(x + 4, y + 9, 8, 6, "#b8553d");
  r(x + 3, y + 8, 10, 2, "#d06a4c");
  r(x + 7, y + 1, 2, 8, "#3f8f3f");
  r(x + 3, y + 3, 5, 4, "#58b04a");
  r(x + 8, y + 2, 5, 4, "#58b04a");
  r(x + 5, y - 2, 6, 4, "#6cc45a");
  r(x + 2, y + 5, 3, 2, "#6cc45a");
  r(x + 11, y + 5, 3, 2, "#6cc45a");
};
SPR.table = (x, y, w, h) => {
  const W = w * 16;
  r(x, y + 2, W, 24, "#9a6a35");
  r(x, y + 2, W, 1, "#c18a4a");
  const cols = Math.floor((W - 2) / 4);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < 5; j++) {
      r(x + 1 + i * 4, y + 3 + j * 4, 4, 4, (i + j) % 2 ? "#5b80c0" : "#7da0d8");
    }
  }
  r(x + 1, y + 26, W - 2, h * 16 - 28, "#7a4a2a");
  r(x + W / 2 - 3, y + 11, 6, 5, "#b8553d");
  r(x + W / 2 - 4, y + 6, 8, 6, "#58b04a");
  r(x + W / 2 - 1, y + 4, 2, 3, "#6cc45a");
};
SPR.chair = (x, y, w, h, it) => {
  r(x + 3, y + 6, 10, 8, "#b57a45");
  r(x + 3, y + 13, 10, 2, "#8a5a2c");
  if (it.dir === "right") r(x + 1, y + 2, 3, 12, "#8a5a2c");
  else if (it.dir === "left") r(x + 12, y + 2, 3, 12, "#8a5a2c");
  else r(x + 3, y + 1, 10, 5, "#8a5a2c");
};
SPR.bowl = (x, y) => {
  r(x + 2, y + 9, 12, 5, "#d96b8a");
  r(x + 3, y + 8, 10, 6, "#7aa6d6");
  r(x + 3, y + 8, 10, 2, "#a8c6ea");
  r(x + 3, y + 13, 10, 1, "#5a86b6");
  const h = Math.round((bowlLevel / 100) * 4);
  if (h > 0) {
    r(x + 4, y + 8 - h, 8, h + 1, "#e8803a");
    r(x + 5, y + 8 - h, 3, 1, "#f5a85a");
  }
};
SPR.lamp = (x, y) => {
  r(x + 7, y - 4, 2, 18, "#8a5a2c");
  r(x + 4, y - 10, 8, 7, "#ffd98a");
  r(x + 4, y - 10, 8, 1, "#fff0c0");
  r(x + 5, y + 13, 6, 2, "#6b4226");
};
SPR.bookshelf = (x, y, w) => {
  const W = w * 16;
  r(x, y - 14, W, 30, "#7a4a2a");
  r(x + 1, y - 13, W - 2, 28, "#5e3a1f");
  const cols = ["#c0392b", "#2e86c1", "#f1c40f", "#27ae60", "#8e44ad", "#e58fa6", "#d68910"];
  for (let s = 0; s < 3; s++) {
    const sy = y - 13 + s * 9;
    r(x + 1, sy + 8, W - 2, 1, "#7a4a2a");
    const n = Math.floor((W - 4) / 3);
    for (let i = 0; i < n; i++) {
      const bh = 5 + ((i * 7 + s * 3) % 3);
      r(x + 2 + i * 3, sy + 8 - bh, 2, bh, cols[(i * 3 + s * 2 + (i % 3)) % cols.length]);
    }
  }
};
SPR.fireplace = (x, y, w) => {
  const W = w * 16;
  r(x, y - 14, W, 30, "#8b8b92");
  for (let j = 0; j < 6; j++) {
    r(x, y - 14 + j * 5 + 4, W, 1, "#6e6e75");
    for (let i = 0; i < 4; i++) {
      r(x + ((i * 9 + (j % 2) * 4) % W), y - 14 + j * 5, 1, 4, "#6e6e75");
    }
  }
  r(x - 1, y - 16, W + 2, 3, "#7a4a2a");
  r(x - 1, y - 16, W + 2, 1, "#9a6338");
  r(x + 6, y - 4, W - 12, 20, "#241510");
  const f = Math.floor(curNow / 140) % 3;
  const hs = [[6, 9, 5], [8, 6, 8], [5, 8, 6]][f];
  r(x + 9, y + 12, W - 18, 3, "#6b4226");
  r(x + 10, y + 12 - hs[0], 4, hs[0], "#e8651a");
  r(x + 14, y + 12 - hs[1], 4, hs[1], "#f08a24");
  r(x + 18, y + 12 - hs[2], 4, hs[2], "#e8651a");
  r(x + 15, y + 14 - hs[1], 2, hs[1] - 2, "#ffd44d");
  r(x + 4, y + 16, W - 8, 4, "rgba(255,160,60,0.18)");
};
SPR.coffeetable = (x, y, w) => {
  const W = w * 16;
  r(x, y + 2, W, 11, "#b9803f");
  r(x, y + 2, W, 1, "#d8a060");
  r(x, y + 13, W, 3, "#8a5a2c");
  r(x + 4, y + 4, 7, 5, "#3a5fa0");
  r(x + 5, y + 5, 5, 1, "#a8c0e8");
  r(x + 20, y + 5, 4, 4, "#ffffff");
  r(x + 21, y + 6, 2, 2, "#8a5a2c");
};
SPR.sofa = (x, y, w) => {
  const W = w * 16;
  r(x, y - 2, W, 18, "#2f5490");
  r(x, y - 2, W, 9, "#3d6bb0");
  r(x, y - 2, W, 1, "#5b88cc");
  r(x, y + 7, W, 1, "#2a4a80");
  r(x, y + 1, 4, 15, "#34609f");
  r(x + W - 4, y + 1, 4, 15, "#34609f");
  for (let i = 1; i < w; i++) r(x + i * 16 - 1, y - 1, 1, 8, "#2a4a80");
  r(x + 8, y - 1, 6, 5, "#e58fa6");
  r(x + W - 14, y - 1, 6, 5, "#ffd98a");
};
SPR.bed = (x, y, w, h) => {
  const W = w * 16;
  const H = h * 16;
  r(x, y + 1, W, H - 2, "#7a4a2a");
  r(x + 1, y + 2, W - 2, H - 4, "#f2ece0");
  r(x + 1, y + 1, 4, H - 2, "#8f5b30");
  r(x + 1, y + 1, 4, 1, "#b07840");
  r(x + 6, y + 5, 10, 9, "#ffffff");
  r(x + 6, y + 13, 10, 1, "#d9d2c4");
  r(x + 6, y + 18, 10, 9, "#ffffff");
  r(x + 6, y + 26, 10, 1, "#d9d2c4");
  r(x + 18, y + 2, W - 20, H - 4, "#e0839c");
  r(x + 18, y + 2, 4, H - 4, "#f0a9bb");
  r(x + 30, y + 2, 2, H - 4, "#cf7189");
  r(x + 38, y + 2, 2, H - 4, "#cf7189");
  r(x + W - 5, y + 1, 4, H - 2, "#8f5b30");
};
SPR.nightstand = (x, y) => {
  r(x + 2, y + 5, 12, 10, "#b57a45");
  r(x + 2, y + 4, 12, 3, "#d0975e");
  r(x + 4, y + 10, 8, 1, "#8a5a2c");
  r(x + 7, y + 11, 2, 2, "#f3dcae");
  r(x + 6, y + 1, 4, 3, "#e8c36a");
  r(x + 4, y - 4, 8, 5, "#ffd98a");
};
SPR.wardrobe = (x, y, w) => {
  const W = w * 16;
  r(x, y - 14, W, 30, "#8a5a2c");
  r(x, y - 14, W, 1, "#b07840");
  const n = Math.max(1, Math.floor(W / 16));
  for (let i = 0; i < n; i++) {
    r(x + 2 + i * 16, y - 12, 12, 26, "#a36b38");
    r(x + 3 + i * 16, y - 11, 10, 1, "#c28850");
    r(x + 10 + (i % 2 ? -7 : 0) + i * 16, y + 1, 2, 3, "#f3dcae");
  }
};
SPR.dresser = (x, y, w) => {
  const W = w * 16;
  r(x, y + 2, W, 14, "#a36b38");
  r(x, y + 2, W, 3, "#c28850");
  r(x, y + 9, W, 1, "#7a4a2a");
  for (let i = 0; i < w; i++) {
    r(x + i * 16 + 6, y + 6, 4, 1, "#f3dcae");
    r(x + i * 16 + 6, y + 12, 4, 1, "#f3dcae");
  }
  r(x + 3, y - 3, 5, 5, "#e58fa6");
  r(x + W - 9, y - 1, 6, 3, "#8fd0e8");
};
SPR.cabinet = (x, y, w) => {
  const W = w * 16;
  r(x, y + 1, W, 15, "#5f8fa8");
  r(x, y + 1, W, 3, "#82b0c6");
  r(x, y + 4, W, 1, "#476e82");
  for (let i = 0; i < w; i++) {
    r(x + i * 16 + 15, y + 5, 1, 11, "#476e82");
    r(x + i * 16 + 11, y + 8, 3, 2, "#e6eef2");
  }
  r(x + 3, y - 4, 5, 5, "#e8d8a8");
  r(x + W - 9, y - 2, 6, 3, "#9fd0b5");
};
SPR.bucket = (x, y) => {
  r(x + 11, y - 6, 1, 15, "#8a5a2c");
  r(x + 9, y + 8, 5, 4, "#f0f0f0");
  r(x + 4, y + 7, 8, 8, "#6fb7e8");
  r(x + 4, y + 7, 8, 2, "#a2d4f5");
  r(x + 4, y + 14, 8, 1, "#3e84b5");
  r(x + 5, y + 4, 6, 1, "#8a8f94");
};
SPR.washer = (x, y) => {
  r(x + 1, y - 2, 14, 17, "#e8edf0");
  r(x + 1, y - 2, 14, 1, "#ffffff");
  r(x + 14, y - 2, 1, 17, "#b8c2c8");
  r(x + 2, y - 1, 12, 3, "#c3ccd2");
  r(x + 3, y, 2, 1, "#e0504f");
  r(x + 11, y, 2, 1, "#6fb7e8");
  r(x + 4, y + 4, 8, 8, "#9bb7c4");
  r(x + 5, y + 5, 6, 6, "#6d8fa0");
  r(x + 6, y + 6, 2, 2, "#a8c8d6");
};
SPR.basket = (x, y) => {
  r(x + 2, y + 6, 12, 9, "#b98a52");
  r(x + 2, y + 6, 12, 1, "#d6a870");
  for (let j = 0; j < 3; j++) r(x + 2, y + 8 + j * 3, 12, 1, "#9a6f3c");
  r(x + 3, y + 3, 10, 4, "#e58fa6");
  r(x + 5, y + 2, 4, 3, "#8fd0e8");
};

// ---- Фон: пол, ковры, стены, украшения рисуются один раз ----
const bg = document.createElement("canvas");
bg.width = canvas.width;
bg.height = canvas.height;
const bgCtx = bg.getContext("2d");

function buildBackground() {
  g = bgCtx;
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const c = tileAt(tx, ty);
      if (c !== "#") drawFloorTile(tx, ty, c);
    }
  }
  for (const ru of LAYOUT.rugs) drawRug(ru);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (tileAt(tx, ty) === "#") drawWallTile(tx, ty);
    }
  }
  for (const d of LAYOUT.decor) DEC[d.t](d.x * T, d.y * T, d.w);
  g = ctx;
}

function setTheme(id, announce) {
  if (!THEMES[id]) id = "cabin";
  theme = THEMES[id];
  store("tamolove_theme", id);
  buildBackground();
  const st = document.documentElement.style;
  st.setProperty("--f1", theme.frame[0]);
  st.setProperty("--f2", theme.frame[1]);
  st.setProperty("--f3", theme.frame[2]);
  if (announce) showToast("Стиль дома: " + theme.name + " 🏠");
}
setTheme(load("tamolove_theme") || "cabin", false);

const themeBtn = document.getElementById("themeBtn");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const cur = THEME_ORDER.indexOf(load("tamolove_theme") || "cabin");
    setTheme(THEME_ORDER[(cur + 1) % THEME_ORDER.length], true);
  });
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
  for (const f of LAYOUT.items) {
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
        // если новая мебель встала на место персонажа, ставим его на старт
        if (blockedAt(player.x, player.y)) {
          const s = LAYOUT.spawn[myRole];
          player.x = s.x;
          player.y = s.y;
          dirty = true;
        }
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
      bowlLevel = msg.house.bowl;
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

  const rc = tileAt(Math.floor(player.x), Math.floor(player.y));
  const rn = LAYOUT.rooms[rc];
  if (rn && roomLabel.textContent !== rn) {
    roomLabel.textContent = rn;
  }

  updateActionButton();
}

// ---------- Рисование героев ----------
function drawCharacter(c, look, sleeping) {
  const px = Math.round(c.x * T - 5);
  const py = Math.round(c.y * T - 10);
  ctx.globalAlpha = sleeping ? 0.55 : 1;
  // тень
  r(px, py + 15, 10, 3, "rgba(0,0,0,0.18)");
  // ноги
  r(px + 2, py + 12, 2, 4, look.pants);
  r(px + 6, py + 12, 2, 4, look.pants);
  // тело
  r(px + 1, py + 7, 8, 6, look.shirt);
  // голова
  r(px + 1, py + 1, 8, 7, look.skin);
  // волосы и чёлка
  r(px, py, 10, 3, look.hair);
  if (c.facing === "up") {
    r(px, py, 10, 7, look.hair);
  } else {
    r(px, py + 3, 2, 3, look.hair);
    r(px + 8, py + 3, 2, 3, look.hair);
    r(px + 2, py + 3, 3, 1, look.hair);
  }
  // глаза (во сне закрыты)
  if (c.facing !== "up") {
    if (sleeping) {
      r(px + 2, py + 6, 2, 1, "#222");
      r(px + 6, py + 6, 2, 1, "#222");
    } else if (c.facing === "left") {
      r(px + 2, py + 5, 2, 2, "#222");
    } else if (c.facing === "right") {
      r(px + 6, py + 5, 2, 2, "#222");
    } else {
      r(px + 2, py + 5, 2, 2, "#222");
      r(px + 6, py + 5, 2, 2, "#222");
    }
  }
  // еда в руках
  if (c.carrying) {
    r(px + 7, py + 8, 6, 5, "#8b5e34");
    r(px + 8, py + 8, 4, 2, "#e8803a");
  }
  ctx.globalAlpha = 1;
}

function drawName(c, name, sleeping) {
  const px = Math.round(c.x * T - 5);
  const py = Math.round(c.y * T - 10);
  ctx.textAlign = "center";
  if (name) {
    ctx.font = "bold 7px sans-serif";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(name, px + 5, py - 2);
    ctx.fillStyle = "#6b2d45";
    ctx.fillText(name, px + 5, py - 2);
  }
  if (sleeping) {
    ctx.font = "bold 7px sans-serif";
    ctx.fillStyle = "#4a5a8a";
    ctx.fillText("Zzz", px + 12, py - 6);
  }
}

function drawHeart(c) {
  const px = Math.round(c.x * T);
  const py = Math.round(c.y * T - 24);
  r(px - 4, py, 3, 2, "#e0306a");
  r(px + 1, py, 3, 2, "#e0306a");
  r(px - 5, py + 1, 10, 2, "#e0306a");
  r(px - 4, py + 3, 8, 1, "#e0306a");
  r(px - 2, py + 4, 4, 1, "#e0306a");
  r(px - 1, py + 5, 2, 1, "#e0306a");
}

function draw(now) {
  curNow = now;
  g = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bg, 0, 0);

  // всё, что стоит в доме, рисуем по порядку: что дальше от нас, то раньше
  const list = [];
  for (const it of LAYOUT.items) {
    list.push({ sort: (it.y + it.h) * T, item: it });
  }
  if (myRole) {
    list.push({ sort: player.y * T + 6, me: true });
  }
  if (partner.present && partnerRole) {
    list.push({ sort: partner.y * T + 6, other: true });
  }
  list.sort((a, b) => a.sort - b.sort);

  for (const e of list) {
    if (e.item) {
      const it = e.item;
      const x = it.x * T;
      const y = it.y * T;
      if (it.solid) {
        r(x + 1, y + it.h * T - 2, it.w * T - 2, 4, "rgba(0,0,0,0.14)");
      }
      SPR[it.t](x, y, it.w, it.h, it);
    } else if (e.me) {
      drawCharacter(player, looks[myRole], false);
    } else if (e.other) {
      drawCharacter(partner, looks[partnerRole], !partner.online);
    }
  }

  if (myRole) drawName(player, player.name, false);
  if (partner.present && partnerRole) drawName(partner, partner.name, !partner.online);
  if (myRole && now < emoteUntil) drawHeart(player);
}

// ---------- Размер экрана ----------
function fitCanvas() {
  const wrap = document.getElementById("gameWrap");
  const w = wrap.clientWidth - 36;
  const h = wrap.clientHeight - 40;
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

