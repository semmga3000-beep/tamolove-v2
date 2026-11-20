// Мини-игры: готовка (поймать момент) и уборка (оттереть пятна).
// Этот файл работает вместе с game.js и ничего в нём не ломает.
(function () {
  // ---------- Окно мини-игры ----------
  const css = document.createElement("style");
  css.textContent =
    "#mini{position:fixed;inset:0;background:rgba(60,20,40,.55);display:none;align-items:center;justify-content:center;z-index:20;touch-action:none}" +
    "#mini.show{display:flex}" +
    "#miniCard{background:#fff8f0;border:3px solid #6b2d45;border-radius:16px;padding:12px;width:min(92vw,360px);text-align:center;color:#6b2d45;font-family:sans-serif}" +
    "#miniTitle{font-weight:bold;font-size:18px;margin-bottom:6px}" +
    "#miniCanvas{width:100%;background:#fdebd0;border-radius:10px;touch-action:none;display:block}" +
    "#miniHint{font-size:14px;margin:6px 0;min-height:38px}" +
    ".miniBtn{width:100%;border:none;border-radius:14px;background:#ff6f91;color:#fff;font-size:20px;font-weight:bold;padding:14px;margin-top:6px}" +
    ".miniBtn:active{background:#e0668f}" +
    "#miniClose{background:#c9a0b0;font-size:14px;padding:8px}";
  document.head.appendChild(css);

  const box = document.createElement("div");
  box.id = "mini";
  box.innerHTML =
    '<div id="miniCard"><div id="miniTitle"></div>' +
    '<canvas id="miniCanvas" width="300" height="180"></canvas>' +
    '<div id="miniHint"></div>' +
    '<button class="miniBtn" id="miniGo">Стоп!</button>' +
    '<button class="miniBtn" id="miniClose">Закрыть</button></div>';
  document.body.appendChild(box);

  const mc = document.getElementById("miniCanvas");
  const m = mc.getContext("2d");
  const titleEl = document.getElementById("miniTitle");
  const hintEl = document.getElementById("miniHint");
  const goBtn = document.getElementById("miniGo");
  const closeBtn = document.getElementById("miniClose");

  let game = null;
  let raf = 0;

  function open(title, hint, showGo) {
    titleEl.textContent = title;
    hintEl.textContent = hint;
    goBtn.style.display = showGo ? "block" : "none";
    box.classList.add("show");
  }
  function close() {
    game = null;
    cancelAnimationFrame(raf);
    box.classList.remove("show");
  }
  closeBtn.addEventListener("click", close);

  // ---------- Монеты ----------
  const coinsEl = document.createElement("span");
  coinsEl.style.marginLeft = "6px";
  coinsEl.textContent = "🪙 0";
  const top = document.getElementById("top");
  if (top) top.appendChild(coinsEl);

  const oldHandle = handleMessage;
  handleMessage = function (msg) {
    if (msg && msg.type === "state" && msg.house && typeof msg.house.coins === "number") {
      coinsEl.textContent = "🪙 " + msg.house.coins;
    }
    oldHandle(msg);
  };

  // ---------- Готовка: поймай момент ----------
  const ZONE_W = [86, 64, 46];
  const SPEED = [190, 250, 320];
  const BAR_X = 20;
  const BAR_W = 260;

  function newRound(g) {
    const w = ZONE_W[g.round];
    g.zoneW = w;
    g.zoneC = BAR_X + w / 2 + Math.random() * (BAR_W - w);
    g.pos = BAR_X;
    g.dir = 1;
    g.wait = 0;
  }

  function startCook() {
    game = { kind: "cook", round: 0, scores: [], done: false, msg: "" };
    newRound(game);
    open("🍳 Приготовь еду", "Нажимай «Стоп!», когда ложка в зелёной зоне. Три раунда.", true);
    loop(performance.now());
  }

  function cookStop() {
    const g = game;
    if (!g || g.kind !== "cook" || g.done || g.wait > 0) return;
    const d = Math.abs(g.pos - g.zoneC);
    const ratio = d / (g.zoneW / 2);
    const s = ratio <= 1 ? 100 - 30 * ratio : Math.max(0, 70 - (ratio - 1) * 35);
    g.scores.push(s);
    g.msg = s >= 80 ? "Отлично! 🌟" : s >= 50 ? "Хорошо 👍" : "Мимо 😅";
    hintEl.textContent = g.msg;
    g.wait = 0.7;
    if (g.scores.length >= 3) {
      g.done = true;
      const avg = g.scores.reduce((a, b) => a + b, 0) / 3;
      hintEl.textContent = avg >= 80 ? "Шедевр! 🌟" : avg >= 50 ? "Вкусно получилось! 😋" : "Немного подгорело 😅";
      sendMsg({ type: "cook", score: Math.round(avg) });
      setTimeout(close, 1500);
    }
  }
  goBtn.addEventListener("click", cookStop);

  function drawCook(g) {
    m.clearRect(0, 0, 300, 180);
    m.fillStyle = "#fdebd0";
    m.fillRect(0, 0, 300, 180);
    // кастрюля и пар
    m.font = "44px sans-serif";
    m.textAlign = "center";
    m.fillText("🍲", 150, 150);
    const t = performance.now() / 400;
    m.font = "18px sans-serif";
    m.fillText("♨", 130 + Math.sin(t) * 6, 100 - ((t * 10) % 14));
    m.fillText("♨", 170 + Math.cos(t) * 6, 100 - ((t * 8) % 14));
    // шкала
    m.fillStyle = "#e7c9a4";
    m.fillRect(BAR_X, 40, BAR_W, 22);
    m.fillStyle = "#6fcf6f";
    m.fillRect(g.zoneC - g.zoneW / 2, 40, g.zoneW, 22);
    m.strokeStyle = "#6b2d45";
    m.lineWidth = 2;
    m.strokeRect(BAR_X, 40, BAR_W, 22);
    // ложка
    m.font = "24px sans-serif";
    m.fillText("🥄", g.pos, 34);
    // раунды
    m.fillStyle = "#6b2d45";
    m.font = "bold 14px sans-serif";
    m.fillText("Раунд " + Math.min(3, g.round + 1) + " из 3", 150, 20);
  }

  // ---------- Уборка: оттирай пятна пальцем ----------
  function startScrub() {
    const spots = [];
    for (let i = 0; i < 6; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const r = 20 + Math.random() * 7;
        const x = 30 + Math.random() * 240;
        const y = 40 + Math.random() * 120;
        if (spots.every((s) => Math.hypot(s.x - x, s.y - y) > s.r + r + 4)) {
          spots.push({ x, y, r, hp: 1 });
          break;
        }
      }
    }
    game = { kind: "scrub", spots, left: 20, down: false, lx: 0, ly: 0, px: -50, py: -50, done: false };
    open("🧹 Уборка", "Води пальцем по пятнам, чтобы оттереть их. Время ограничено.", false);
    loop(performance.now());
  }

  function cleanedCount(g) {
    return g.spots.filter((s) => s.hp <= 0).length;
  }

  function finishScrub() {
    const g = game;
    if (!g || g.done) return;
    g.done = true;
    const n = cleanedCount(g);
    hintEl.textContent = n >= 6 ? "Блестит! ✨" : n > 0 ? "Оттёр пятен: " + n : "Ничего не вышло, попробуй ещё";
    sendMsg({ type: "clean", spots: n });
    setTimeout(close, 1400);
  }

  function pointerPos(e) {
    const rc = mc.getBoundingClientRect();
    return [((e.clientX - rc.left) * 300) / rc.width, ((e.clientY - rc.top) * 180) / rc.height];
  }
  mc.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const g = game;
    if (!g) return;
    if (g.kind === "cook") {
      cookStop();
      return;
    }
    const p = pointerPos(e);
    g.down = true;
    g.lx = g.px = p[0];
    g.ly = g.py = p[1];
    try { mc.setPointerCapture(e.pointerId); } catch (err) {}
  });
  mc.addEventListener("pointermove", (e) => {
    const g = game;
    if (!g || g.kind !== "scrub" || !g.down || g.done) return;
    e.preventDefault();
    const p = pointerPos(e);
    const d = Math.hypot(p[0] - g.lx, p[1] - g.ly);
    g.lx = g.px = p[0];
    g.ly = g.py = p[1];
    for (const s of g.spots) {
      if (s.hp > 0 && Math.hypot(s.x - p[0], s.y - p[1]) < s.r + 12) {
        s.hp -= d / (s.r * 7);
      }
    }
    if (cleanedCount(g) === g.spots.length) finishScrub();
  });
  const up = () => { if (game) game.down = false; };
  mc.addEventListener("pointerup", up);
  mc.addEventListener("pointercancel", up);

  function drawScrub(g) {
    m.clearRect(0, 0, 300, 180);
    for (let ty = 0; ty < 6; ty++) {
      for (let tx = 0; tx < 10; tx++) {
        m.fillStyle = (tx + ty) % 2 ? "#d6e8f0" : "#cbe0ea";
        m.fillRect(tx * 30, ty * 30, 30, 30);
      }
    }
    for (const s of g.spots) {
      if (s.hp > 0) {
        m.globalAlpha = 0.35 + 0.65 * Math.max(0, s.hp);
        m.fillStyle = "#6b4a2b";
        m.beginPath();
        m.ellipse(s.x, s.y, s.r, s.r * 0.8, 0, 0, Math.PI * 2);
        m.fill();
        m.fillStyle = "#8a6a45";
        m.beginPath();
        m.ellipse(s.x - 5, s.y - 4, s.r * 0.4, s.r * 0.3, 0, 0, Math.PI * 2);
        m.fill();
        m.globalAlpha = 1;
      } else {
        m.font = "16px sans-serif";
        m.textAlign = "center";
        m.fillText("✨", s.x, s.y + 6);
      }
    }
    if (g.down) {
      m.font = "30px sans-serif";
      m.textAlign = "center";
      m.fillText("🧽", g.px, g.py + 10);
    }
    m.fillStyle = "#6b2d45";
    m.font = "bold 14px sans-serif";
    m.textAlign = "left";
    m.fillText("⏱ " + Math.ceil(Math.max(0, g.left)) + " с", 8, 18);
    m.textAlign = "right";
    m.fillText("Пятна: " + cleanedCount(g) + "/" + g.spots.length, 292, 18);
  }

  // ---------- Общий цикл ----------
  let lastT = 0;
  function loop(now) {
    cancelAnimationFrame(raf);
    lastT = now;
    const tick = (t) => {
      const g = game;
      if (!g) return;
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      if (g.kind === "cook") {
        if (g.wait > 0) {
          g.wait -= dt;
          if (g.wait <= 0 && !g.done) {
            g.round++;
            newRound(g);
            hintEl.textContent = "Следующий раунд!";
          }
        } else if (!g.done) {
          g.pos += g.dir * SPEED[g.round] * dt;
          if (g.pos > BAR_X + BAR_W) { g.pos = BAR_X + BAR_W; g.dir = -1; }
          if (g.pos < BAR_X) { g.pos = BAR_X; g.dir = 1; }
        }
        drawCook(g);
      } else {
        if (!g.done) {
          g.left -= dt;
          if (g.left <= 0) finishScrub();
        }
        drawScrub(g);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // ---------- Подключение к кнопке «Действие» ----------
  function wantStove() {
    return !!(session && myRole === "caregiver" && near(player, "stove") && !player.carrying);
  }
  function wantClean() {
    return !!(session && myRole && near(player, "clean"));
  }
  function tryStart() {
    if (game) return true;
    if (wantStove()) { startCook(); return true; }
    if (wantClean()) { startScrub(); return true; }
    if (typeof wantSit === "function" && wantSit()) { sendMsg({ type: "ask_sit" }); return true; }
    return false;
  }

  actBtn.addEventListener(
    "pointerdown",
    (e) => {
      if (tryStart()) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true
  );
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.target && e.target.tagName === "INPUT") return;
      if (e.key === "e" || e.key === "E" || e.key === " ") {
        if (game || wantStove() || wantClean()) {
          if (!e.repeat) tryStart();
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      }
    },
    true
  );

  // ---------- Просьба сесть за стол ----------
  const ask = document.createElement("div");
  ask.id = "sitAsk";
  ask.style.cssText =
    "position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:25;display:none;background:#fff8f0;border:3px solid #6b2d45;border-radius:16px;padding:14px;width:min(88vw,320px);text-align:center;color:#6b2d45;font-family:sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)";
  ask.innerHTML =
    '<div id="sitAskText" style="font-weight:bold;font-size:16px;margin-bottom:10px"></div>' +
    '<div style="display:flex;gap:8px">' +
    '<button class="miniBtn" id="sitYes" style="margin:0;font-size:16px;padding:12px">Разрешить</button>' +
    '<button class="miniBtn" id="sitNo" style="margin:0;font-size:16px;padding:12px;background:#c9a0b0">Не сейчас</button></div>';
  document.body.appendChild(ask);
  let askTimer = null;
  function hideAsk() { ask.style.display = "none"; clearTimeout(askTimer); }
  function answerAsk(ok) { hideAsk(); sendMsg({ type: "sit_answer", ok: ok }); }
  document.getElementById("sitYes").addEventListener("click", () => answerAsk(true));
  document.getElementById("sitNo").addEventListener("click", () => answerAsk(false));

  const wrapped = handleMessage;
  handleMessage = function (msg) {
    if (msg && msg.type === "sit_request") {
      document.getElementById("sitAskText").textContent =
        (msg.name || "Партнёр") + " просит сесть рядом и поесть вместе. Разрешить? 🪑";
      ask.style.display = "block";
      clearTimeout(askTimer);
      askTimer = setTimeout(hideAsk, 28000);
      return;
    }
    wrapped(msg);
  };

  function wantSit() {
    return !!(
      session && myRole === "receiver" && partner.present && partner.carrying &&
      near(player, "table") && near(partner, "table") && !near(player, "bowl")
    );
  }

  // Ведущий ест своё блюдо за столом (слева от стола, подальше от миски)
  ZONES.table = [{ x: 3, y: 4, w: 4, h: 2 }];
  const oldActionInfo = actionInfo;
  actionInfo = function () {
    if (wantSit()) return ["🪑", "Сесть рядом"];
    if (session && myRole === "caregiver" && player.carrying && near(player, "table") && !near(player, "bowl")) {
      return ["🍽️", "Поесть"];
    }
    return oldActionInfo();
  };


  // ---------- Магазин мебели ----------
  const CATALOG = [
    { id: "plant1", n: "Цветок у кухни", e: "🪴", c: 3, it: { t: "plant", x: 9, y: 1 }, it2: { x: 6, y: 8 } },
    { id: "plant2", n: "Цветок в гостиной", e: "🪴", c: 3, it: { t: "plant", x: 11, y: 2 }, it2: { x: 13, y: 8 } },
    { id: "plant3", n: "Цветок в спальне", e: "🌿", c: 3, it: { t: "plant", x: 9, y: 8 }, it2: { x: 6, y: 2 } },
    { id: "lamp1", n: "Торшер в гостиной", e: "💡", c: 4, it: { t: "lamp", x: 18, y: 2 }, it2: { x: 13, y: 2 } },
    { id: "lamp2", n: "Лампа в спальне", e: "💡", c: 4, it: { t: "lamp", x: 5, y: 8 }, it2: { x: 6, y: 4 } },
    { id: "night", n: "Тумбочка у кровати", e: "🗄️", c: 5, it: { t: "nightstand", x: 1, y: 11 }, it2: { x: 1, y: 3 } },
    { id: "tvs", n: "Тумба под телевизор", e: "📺", c: 6, it: { t: "tvstand", x: 14, y: 1, w: 2 }, it2: { x: 10, y: 1, w: 2 } },
    { id: "arm", n: "Кресло", e: "🛋️", c: 7, it: { t: "armchair", x: 11, y: 5 }, it2: { x: 13, y: 6 } },
    { id: "pouf", n: "Пуф на кухне", e: "🟣", c: 4, it: { t: "pouf", x: 9, y: 4 }, it2: { x: 1, y: 9 } },
    { id: "lamp3", n: "Лампа на кухне", e: "💡", c: 4, it: { t: "lamp", x: 1, y: 6 }, it2: { x: 1, y: 8 } },
    { id: "shelf", n: "Книжный шкаф в спальне", e: "📚", c: 8, it: { t: "bookshelf", x: 2, y: 8, w: 2 }, it2: { x: 12, y: 1, w: 2 } },
    { id: "aqua", n: "Аквариум", e: "🐠", c: 12, it: { t: "aquarium", x: 14, y: 8, w: 2 }, it2: { x: 15, y: 5, w: 2 } },
    { id: "shower", n: "Душевая кабина", e: "🚿", c: 10, it: { t: "shower", x: 16, y: 8 }, it2: { x: 16, y: 4 } },
    { id: "tv", n: "Телевизор (нужна тумба)", e: "📺", c: 10, need: "tvs", it: { t: "tv", x: 14, y: 1, w: 2, solid: false }, it2: { x: 10, y: 1, w: 2, solid: false } }
  ];
  SPR.armchair = (x, y) => {
    r(x + 1, y + 2, 14, 13, "#8a5a8f");
    r(x + 1, y + 2, 14, 4, "#a577aa");
    r(x + 3, y + 7, 10, 6, "#b88fbd");
    r(x, y + 6, 3, 9, "#76497b");
    r(x + 13, y + 6, 3, 9, "#76497b");
  };
  SPR.pouf = (x, y) => {
    r(x + 2, y + 5, 12, 10, "#9b6fc0");
    r(x + 2, y + 5, 12, 3, "#b88ad8");
    r(x + 3, y + 14, 10, 1, "#6e4a8f");
  };
  SPR.aquarium = (x, y, w) => {
    const W = w * 16;
    r(x, y + 10, W, 6, "#5a3d25");
    r(x + 2, y + 11, W - 4, 1, "#7a5535");
    r(x + 1, y, W - 2, 11, "#2f5f7f");
    r(x + 2, y + 1, W - 4, 8, "#6fc4e8");
    r(x + 2, y + 7, W - 4, 2, "#e8d49a");
    const fx = Math.round(Math.sin(curNow / 600) * 4), fx2 = Math.round(Math.cos(curNow / 800) * 5);
    r(x + 8 + fx, y + 3, 4, 2, "#ff9f5a");
    r(x + 12 + fx, y + 4, 1, 1, "#ff9f5a");
    r(x + W / 2 + 2 + fx2, y + 5, 3, 2, "#ffd24d");
    r(x + 3, y + 5, 1, 3, "#3f9f5a");
    r(x + 4 + (Math.floor(curNow / 500) % 2), y + 2 - (Math.floor(curNow / 400) % 3), 1, 1, "#ffffff");
  };
  SPR.shower = (x, y) => {
    r(x + 1, y - 14, 14, 30, "#8fb0c4");
    r(x + 2, y - 13, 12, 27, "#d8f0fa");
    r(x + 2, y - 13, 12, 3, "#b9d4e0");
    r(x + 8, y - 10, 1, 4, "#9aa6ae");
    r(x + 5, y - 7, 7, 2, "#9aa6ae");
    const sd = Math.floor(curNow / 120) % 3;
    r(x + 6, y - 4 + sd * 3, 1, 2, "#7fc4e8");
    r(x + 9, y - 3 + ((sd + 1) % 3) * 3, 1, 2, "#7fc4e8");
    r(x + 7, y + 1 + ((sd + 2) % 3) * 2, 1, 2, "#7fc4e8");
    r(x + 2, y + 12, 12, 3, "#f4f4f8");
    r(x + 7, y + 13, 2, 1, "#9aa6ae");
  };
  SPR.tvstand = (x, y, w) => {
    const W = w * 16;
    r(x, y + 4, W, 12, "#6b4a2c");
    r(x, y + 4, W, 1, "#8f6a40");
    r(x + 2, y + 7, 12, 6, "#4d3320");
    r(x + W - 14, y + 7, 12, 6, "#4d3320");
    r(x + 2, y + 13, 3, 3, "#3a2514");
    r(x + W - 5, y + 13, 3, 3, "#3a2514");
  };
  SPR.tv = (x, y, w) => {
    const W = w * 16;
    const tf = Math.floor(curNow / 700) % 4;
    r(x + 3, y - 10, W - 6, 14, "#22252e");
    r(x + 5, y - 8, W - 10, 9, ["#6fb6d8", "#e8a0c0", "#8fd88f", "#f0d070"][tf]);
    r(x + 6 + ((Math.floor(curNow / 300) * 3) % (W - 16)), y - 7, 6, 2, "#ffffff");
    r(x + W / 2 - 3, y + 3, 6, 2, "#22252e");
  };
  // тумбочки вдоль стены, камин правее
  for (const i of LAYOUT.items) {
    if (i.t === "nightstand" && i.x === 4 && i.y === 9 && !i.sid) { i.x = 1; i.y = 8; }
    else if (i.t === "fireplace") i.x = 16;
  }

  // ---------- Обои и пол ----------
  const WALLS = [["w_pink", "Розовые обои", "#f6cfdc", "#eab8ca"], ["w_mint", "Мятные обои", "#cfeadd", "#b6dccb"], ["w_lav", "Сиреневые обои", "#ddd0f0", "#cbb9e6"], ["w_sun", "Солнечные обои", "#fbe9a8", "#f2d98a"], ["w_blue", "Голубые обои", "#cfe0f5", "#b9d0ee"]];
  const FLOORS = [["f_light", "Светлый паркет", "wood", "#e3c299", "#cfa878", "#efd2ac"], ["f_dark", "Тёмный паркет", "wood", "#8a5a3a", "#6e4529", "#9d6b46"], ["f_gray", "Серая плитка", "tile", "#d9d9df", "#cdcdd5", "#b8b8c2"], ["f_pink", "Розовая плитка", "tile", "#f6d4de", "#efc3d0", "#dfa8b8"]];
  let paint = { wall: null, floor: null };
  const origWall = wallpaperFor;
  wallpaperFor = function (tx, ty) {
    const w = WALLS.find((x) => x[0] === paint.wall);
    return w ? [w[2], w[3]] : origWall(tx, ty);
  };
  const origFloor = drawFloorTile;
  drawFloorTile = function (tx, ty, c) {
    const f = FLOORS.find((x) => x[0] === paint.floor);
    if (!f || c === "d") return origFloor(tx, ty, c);
    const x = tx * T, y = ty * T;
    if (f[2] === "tile") {
      r(x, y, T, T, (tx + ty) % 2 === 0 ? f[3] : f[4]);
      r(x, y + 7, T, 1, f[5]); r(x, y + 15, T, 1, f[5]); r(x + 7, y, 1, T, f[5]); r(x + 15, y, 1, T, f[5]);
    } else {
      r(x, y, T, T, f[3]);
      r(x, y, T, 1, f[4]); r(x, y + 8, T, 1, f[4]);
      r(x, y + 1, T, 1, f[5]); r(x, y + 9, T, 1, f[5]);
      r(x + ((tx * 5 + ty * 3) % 14) + 1, y + 1, 1, 7, f[4]);
      r(x + ((tx * 3 + ty * 7 + 5) % 14) + 1, y + 9, 1, 7, f[4]);
    }
  };
  const paintKey = () => paint.wall + "|" + paint.floor;
  let owned = [];
  let coinsNow = 0;
  const shop = document.createElement("div");
  shop.style.cssText = "position:fixed;inset:0;background:rgba(60,20,40,.6);display:none;z-index:30;align-items:center;justify-content:center";
  shop.innerHTML = '<div style="background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:14px;width:92%;max-width:360px;max-height:85%;overflow:auto;text-align:center"><b style="font-size:18px">🛒 Магазин</b><div id="shopCoins" style="margin:6px 0"></div><div id="shopList"></div><button id="shopClose" style="margin-top:10px;border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:16px;padding:10px 20px">Закрыть</button></div>';
  document.body.appendChild(shop);
  function renderShop() {
    document.getElementById("shopCoins").textContent = "У вас: 🪙 " + coinsNow;
    const box = document.getElementById("shopList");
    box.innerHTML = "";
    for (const c of CATALOG) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;margin:6px 0;text-align:left";
      const has = owned.includes(c.id);
      const lock = c.need && !owned.includes(c.need);
      row.innerHTML = '<span style="font-size:24px">' + c.e + '</span><span style="flex:1;font-size:14px">' + c.n + "</span>";
      const b = document.createElement("button");
      b.style.cssText = "border:none;border-radius:10px;color:#fff;font-size:14px;padding:8px 10px;background:" + (has ? "#9bc59b" : coinsNow >= c.c && !lock ? "#ff6f91" : "#c9b0b8");
      b.textContent = has ? "Куплено ✅" : "🪙 " + c.c;
      if (!has) b.onclick = () => { if (lock) showToast("Сначала купи тумбу 📺"); else sendMsg({ type: "buy", id: c.id }); };
      row.appendChild(b);
      box.appendChild(row);
    }
    const hd = document.createElement("div");
    hd.innerHTML = "<b>🎨 Обои и пол</b>";
    hd.style.margin = "12px 0 4px";
    box.appendChild(hd);
    const addPaint = (list, kind) => {
      const cur = kind === "wall" ? paint.wall : paint.floor;
      const reset = document.createElement("button");
      reset.textContent = (cur ? "" : "✓ ") + (kind === "wall" ? "Обои как были" : "Пол как был");
      reset.style.cssText = "margin:3px;border:none;border-radius:10px;background:#b79bd1;color:#fff;font-size:13px;padding:7px 9px";
      reset.onclick = () => sendMsg({ type: "paint", [kind]: null });
      box.appendChild(reset);
      for (const p of list) {
        const has = owned.includes(p[0]);
        const b = document.createElement("button");
        const on = cur === p[0];
        b.textContent = p[1] + (on ? " ✓" : has ? "" : " 🪙 5");
        b.style.cssText = "margin:3px;border:none;border-radius:10px;color:#fff;font-size:13px;padding:7px 9px;background:" + (on ? "#9bc59b" : has ? "#ff6f91" : coinsNow >= 5 ? "#ff9f5a" : "#c9b0b8");
        b.onclick = () => { if (has) sendMsg({ type: "paint", [kind]: p[0] }); else sendMsg({ type: "buy", id: p[0] }); };
        box.appendChild(b);
      }
    };
    addPaint(WALLS, "wall");
    box.appendChild(document.createElement("br"));
    addPaint(FLOORS, "floor");
  }
  function syncOwned() {
    LAYOUT.items = LAYOUT.items.filter((i) => !i.sid);
    for (const c of CATALOG) {
      if (!owned.includes(c.id)) continue;
      const it = Object.assign({ w: 1, h: 1, solid: true, sid: c.id, k: c.id }, c.it, curPlan === 2 && c.it2 ? c.it2 : {});
      pose(it, moved[keyOf(c.id === "tv" ? "tvs" : c.id)]);
      LAYOUT.items.push(it);
    }
  }
  const shopBtn = document.createElement("button");
  shopBtn.textContent = "🛒 Магазин";
  shopBtn.style.cssText = "margin-left:6px;border:none;border-radius:10px;background:#ffb347;color:#fff;font-size:13px;padding:4px 10px";
  shopBtn.onclick = () => { renderShop(); shop.style.display = "flex"; };
  if (top) top.appendChild(shopBtn);
  document.getElementById("shopClose").onclick = () => { shop.style.display = "none"; };
  const prevHandle = handleMessage;
  handleMessage = function (msg) {
    prevHandle(msg);
    if (msg && msg.type === "state" && msg.house) {
      if (Array.isArray(msg.house.owned)) { owned = msg.house.owned; syncOwned(); }
      if (typeof msg.house.coins === "number") coinsNow = msg.house.coins;
      if (msg.house.paint) {
        const before = paintKey();
        paint = { wall: msg.house.paint.wall || null, floor: msg.house.paint.floor || null };
        if (paintKey() !== before) buildBackground();
      }
      if (shop.style.display === "flex") renderShop();
    }
  };


  // ---------- Внешность ----------
  const PAL = {
    skin: { human: ["#f5c9a0", "#ffe0cc", "#e8b48a", "#c68a5e", "#8d5a3b"], animal: ["#e8a050", "#b0b0b8", "#fafafa", "#a8744c", "#3a3a44", "#ffb6c8"], ghost: ["#ffffff", "#d8f0ff", "#ffd8f0", "#e8ffd8", "#e8d8ff"] },
    hair: ["#2f2a3a", "#5a3825", "#a0522d", "#e8c36a", "#ff8fb1", "#6fa8ff", "#ffffff", "#d04040"],
    shirt: ["#ff6f91", "#6fa8ff", "#7ed08a", "#ffd24d", "#b79bd1", "#ff9f5a", "#ffffff", "#3a3a44"],
    pants: ["#4a5a8a", "#5a4a7a", "#3a3a44", "#8a5a2c", "#2f6f6f", "#c0c0d0"]
  };
  const TYPES = [["human", "👤 Человек"], ["animal", "🐱 Зверёк"], ["ghost", "👻 Призрак"]];
  const STYLES = [["short", "Короткие"], ["long", "Длинные"], ["bun", "Пучок"]];
  const cur = () => looks[myRole];
  // --- уход спать: идём к кровати по проходимым клеткам и ложимся ---
  function bedSpot(role) {
    const bed = LAYOUT.items.find((i) => i.t === "bed");
    if (!bed) return null;
    const fr = role === "caregiver" ? 0.3 : 0.7;
    const wide = bed.w >= bed.h;
    return { bed, x: bed.x + (wide ? bed.w * fr : bed.w / 2), y: bed.y + (wide ? bed.h / 2 : bed.h * fr) };
  }
  function findPath(sx, sy, bed) {
    const blocked = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || tileAt(tx, ty) === "#") return true;
      return LAYOUT.items.some((i) => i.solid && tx >= i.x && tx < i.x + i.w && ty >= i.y && ty < i.y + i.h);
    };
    const near = (tx, ty) => tx >= bed.x - 1 && tx <= bed.x + bed.w && ty >= bed.y - 1 && ty <= bed.y + bed.h && !(tx >= bed.x && tx < bed.x + bed.w && ty >= bed.y && ty < bed.y + bed.h);
    const st = [Math.floor(sx), Math.floor(sy)];
    const key = (a) => a[0] + "," + a[1];
    const prev = { [key(st)]: null };
    const q = [st];
    while (q.length) {
      const cur = q.shift();
      if (near(cur[0], cur[1]) && !blocked(cur[0], cur[1])) {
        const pts = [];
        for (let n = cur; n; n = prev[key(n)]) pts.unshift([n[0] + 0.5, n[1] + 0.5]);
        return pts;
      }
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = [cur[0] + d[0], cur[1] + d[1]];
        if (prev[key(nx)] !== undefined || blocked(nx[0], nx[1])) continue;
        prev[key(nx)] = cur;
        q.push(nx);
      }
    }
    return null;
  }
  function sleepPrep(c, sleeping) {
    const nowt = performance.now();
    c._lyX = undefined;
    if (!sleeping || c !== partner) {
      c._vx = c.x; c._vy = c.y; c._pth = null;
      return null;
    }
    const sp = bedSpot(partnerRole);
    if (!sp) return null;
    if (!c._pth) {
      c._srv = { x: c.tx !== undefined ? c.tx : c.x, y: c.ty !== undefined ? c.ty : c.y };
      c._pi = 0; c._seg = 0; c._wt = nowt;
      if (c._vx !== undefined && Math.hypot(c._vx - sp.x, c._vy - sp.y) > 1.5) {
        c.x = c._vx; c.y = c._vy;
        c._pth = findPath(c._vx, c._vy, sp.bed) || [];
        c._pth.push([sp.x, sp.y]);
      } else c._pth = [];
      c._vx = undefined;
    }
    const dt = Math.min(0.1, (nowt - c._wt) / 1000);
    c._wt = nowt;
    let left = 3.2 * dt;
    while (left > 0 && c._pi < c._pth.length) {
      const tgt = c._pth[c._pi];
      const dx = tgt[0] - c.x, dy = tgt[1] - c.y;
      const dd = Math.hypot(dx, dy);
      if (dd <= left) { c.x = tgt[0]; c.y = tgt[1]; left -= dd; c._pi++; }
      else { c.x += (dx / dd) * left; c.y += (dy / dd) * left; left = 0; }
      if (Math.abs(dx) > Math.abs(dy)) c.facing = dx > 0 ? "right" : "left"; else c.facing = dy > 0 ? "down" : "up";
    }
    if (c._pi < c._pth.length) { c.tx = c.x; c.ty = c.y; return { lying: false }; }
    // пришёл: ложимся (для сортировки стоим у нижнего края кровати)
    c.x = c._srv.x; c.y = c._srv.y; c.tx = c.x; c.ty = c.y;
    c._lyX = sp.x; c._lyY = sp.y - 0.3;
    return { lying: true, x: sp.x, y: sp.y };
  }
  function drawLying(look, sp) {
    const type = look.type || "human";
    const lx = Math.round(sp.x * T), ly = Math.round(sp.y * T);
    const bob = Math.round(Math.sin(performance.now() / 700));
    ctx.globalAlpha = type === "ghost" ? 0.85 : 1;
    r(lx - 7, ly - 5, 7, 7, look.skin);
    r(lx - 7, ly - 5, 7, 3, look.hair);
    if (type === "animal") { r(lx - 7, ly - 8, 2, 3, look.skin); r(lx - 3, ly - 8, 2, 3, look.skin); }
    r(lx - 5, ly - 1, 2, 1, "#222");
    r(lx - 1, ly - 4, 10, 8, look.shirt);
    r(lx - 1, ly - 4, 10, 1, "rgba(255,255,255,0.35)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 8px sans-serif";
    ctx.fillText("z", lx + 7, ly - 8 + bob);
    ctx.font = "bold 6px sans-serif";
    ctx.fillText("z", lx + 12, ly - 13 + bob);
  }
  const origName = drawName;
  drawName = function (c, name, sleeping) {
    if (c._lyX !== undefined) {
      const sx = c.x, sy = c.y;
      c.x = c._lyX; c.y = c._lyY;
      origName(c, name, sleeping);
      c.x = sx; c.y = sy;
    } else origName(c, name, sleeping);
  };
  drawCharacter = function (c, look, sleeping) {
    const sl = sleepPrep(c, sleeping);
    if (sl && sl.lying) { drawLying(look, sl); return; }
    const type = look.type || "human";
    const style = look.style || "short";
    const nowt = performance.now();
    if (c._lx !== undefined && (Math.abs(c.x - c._lx) > 0.001 || Math.abs(c.y - c._ly) > 0.001)) c._mv = nowt;
    c._lx = c.x; c._ly = c.y;
    const moving = c._mv && nowt - c._mv < 180;
    const step = Math.floor(nowt / 110) % 2;
    const px = Math.round(c.x * T - 5);
    const py0 = Math.round(c.y * T - 10);
    const py = py0 + (type === "ghost" ? Math.round(Math.sin(nowt / 400) * 1.5) : moving && step ? -1 : 0);
    ctx.globalAlpha = sleeping ? 0.55 : type === "ghost" ? 0.85 : 1;
    r(px, py0 + 15, 10, 3, "rgba(0,0,0,0.18)");
    const up = c.facing === "up";
    if (type === "ghost") {
      r(px + 1, py + 1, 8, 13, look.skin);
      r(px, py + 4, 10, 10, look.skin);
      r(px, py + 14, 2, 2, look.skin);
      r(px + 4, py + 14, 2, 2, look.skin);
      r(px + 8, py + 14, 2, 2, look.skin);
      r(px + 1, py + 9, 8, 2, look.shirt);
    } else {
      if (type === "animal") r(px - 2, py + 9, 3, 2, look.skin);
      r(px + 2, py + 12, 2, moving && step ? 3 : 4, look.pants);
      r(px + 6, py + 12, 2, moving && !step ? 3 : 4, look.pants);
      r(px + 1, py + 7, 8, 6, look.shirt);
      r(px + 1, py + 1, 8, 7, look.skin);
      if (type === "animal") {
        r(px + 1, py - 2, 3, 3, look.skin);
        r(px + 6, py - 2, 3, 3, look.skin);
        r(px + 2, py - 1, 1, 1, "#ffb6c8");
        r(px + 7, py - 1, 1, 1, "#ffb6c8");
      }
    }
    // волосы
    r(px, py, 10, 3, look.hair);
    if (style === "bun") r(px + 3, py - 3, 4, 3, look.hair);
    if (up) {
      r(px, py, 10, 7, look.hair);
      if (style === "long") r(px, py + 7, 10, 4, look.hair);
    } else {
      const len = style === "long" ? 7 : 3;
      r(px, py + 3, 2, len, look.hair);
      r(px + 8, py + 3, 2, len, look.hair);
      r(px + 2, py + 3, 3, 1, look.hair); // чёлка
    }
    if (!up) {
      if (sleeping) {
        r(px + 2, py + 6, 2, 1, "#222");
        r(px + 6, py + 6, 2, 1, "#222");
      } else if (c.facing === "left") r(px + 2, py + 5, 2, 2, "#222");
      else if (c.facing === "right") r(px + 6, py + 5, 2, 2, "#222");
      else { r(px + 2, py + 5, 2, 2, "#222"); r(px + 6, py + 5, 2, 2, "#222"); }
      if (type === "animal") r(px + 4, py + 6, 2, 1, "#e0507a");
    }
    if (c.carrying) {
      r(px + 7, py + 8, 6, 5, "#8b5e34");
      r(px + 8, py + 8, 4, 2, "#e8803a");
    }
    ctx.globalAlpha = 1;
  };
  const look = document.createElement("div");
  look.style.cssText = "position:fixed;left:0;right:0;bottom:0;max-height:44%;overflow:auto;background:#fff8f0;border-top:3px solid #6b2d45;border-radius:16px 16px 0 0;padding:10px 12px 16px;display:none;z-index:30;text-align:center;font-size:13px";
  document.body.appendChild(look);
  let backup = null;
  function chips(label, items, getter, setter) {
    const d = document.createElement("div");
    d.style.margin = "3px 0";
    d.innerHTML = "<b>" + label + "</b><br>";
    for (const it of items) {
      const val = Array.isArray(it) ? it[0] : it;
      const b = document.createElement("button");
      const isColor = typeof val === "string" && val[0] === "#";
      b.style.cssText = "margin:2px;border-radius:9px;border:3px solid " + (getter() === val ? "#6b2d45" : "#e0a0b8") + ";font-size:13px;padding:4px 6px;" + (isColor ? "width:28px;height:28px;background:" + val : "background:#fff;color:#6b2d45");
      if (!isColor) b.textContent = it[1];
      b.onclick = () => { setter(val); renderLook(); };
      d.appendChild(b);
    }
    look.appendChild(d);
  }
  function renderLook() {
    const L = cur();
    look.innerHTML = '<b style="font-size:16px">🎨 Смена внешки</b>';
    chips("Кто ты", TYPES, () => L.type || "human", (v) => { L.type = v; L.skin = PAL.skin[v][0]; });
    chips(L.type === "animal" ? "Шёрстка" : L.type === "ghost" ? "Цвет призрака" : "Кожа", PAL.skin[L.type || "human"], () => L.skin, (v) => { L.skin = v; });
    chips("Причёска", STYLES, () => L.style || "short", (v) => { L.style = v; });
    chips("Цвет волос", PAL.hair, () => L.hair, (v) => { L.hair = v; });
    chips(L.type === "ghost" ? "Шарфик" : "Одежда", PAL.shirt, () => L.shirt, (v) => { L.shirt = v; });
    if (L.type !== "ghost") chips("Штаны", PAL.pants, () => L.pants, (v) => { L.pants = v; });
    const ok = document.createElement("button");
    ok.textContent = "Готово ✅";
    ok.style.cssText = "margin:8px 6px 0;border:none;border-radius:12px;background:#ff6f91;color:#fff;font-size:16px;padding:10px 22px";
    ok.onclick = () => { look.style.display = "none"; sendMsg({ type: "look", look: Object.assign({ type: "human", style: "short" }, cur()) }); };
    const no = document.createElement("button");
    no.textContent = "Отмена";
    no.style.cssText = "margin:8px 6px 0;border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:16px;padding:10px 22px";
    no.onclick = () => { look.style.display = "none"; Object.assign(cur(), backup); };
    look.appendChild(ok);
    look.appendChild(no);
  }
  document.getElementById("lookBtn").addEventListener("click", (e) => {
    e.stopImmediatePropagation();
    if (!myRole) return;
    backup = Object.assign({}, cur());
    renderLook();
    look.style.display = "block";
  }, true);
  const prevH2 = handleMessage;
  handleMessage = function (msg) {
    prevH2(msg);
    if (msg && msg.type === "state" && msg.players && look.style.display === "none") {
      for (const rl of ["caregiver", "receiver"]) {
        const pl = msg.players[rl];
        if (pl && pl.look && !(rl === myRole && look.style.display !== "none")) Object.assign(looks[rl], pl.look);
      }
    }
  };


  // ---------- "Был в сети" ----------
  function ago(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 1) return "только что";
    if (m < 60) return m + " мин назад";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " ч назад";
    return Math.floor(h / 24) + " дн назад";
  }
  const prevH3 = handleMessage;
  handleMessage = function (msg) {
    prevH3(msg);
    if (msg && msg.type === "state" && msg.players && partnerRole) {
      const o = msg.players[partnerRole];
      if (o && !o.online && o.seen) {
        partnerInfo.textContent = o.name + " спит 💤 · был(а) в сети " + ago(Date.now() - o.seen);
      }
    }
  };


  // ---------- Задания ----------
  let quests = [];
  const qBox = document.createElement("div");
  qBox.style.cssText = "position:fixed;inset:0;background:rgba(60,20,40,.6);display:none;z-index:30;align-items:center;justify-content:center";
  qBox.innerHTML = '<div style="background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:14px;width:92%;max-width:360px;text-align:center"><b style="font-size:18px">📋 Задания дня</b><div style="font-size:12px;margin:4px 0">Награда сама падает в общий счёт 🪙. Новые задания каждый день.</div><div id="qList"></div><button id="qClose" style="margin-top:10px;border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:16px;padding:10px 20px">Закрыть</button></div>';
  document.body.appendChild(qBox);
  function renderQ() {
    const box = document.getElementById("qList");
    box.innerHTML = "";
    for (const q of quests) {
      const d = document.createElement("div");
      d.style.cssText = "text-align:left;margin:8px 0;font-size:14px";
      d.innerHTML = (q.d ? "✅ " : "") + q.n + " <b>+" + q.r + " 🪙</b>" + '<div style="height:9px;background:#f3d3de;border-radius:6px;overflow:hidden;margin-top:3px"><div style="height:100%;width:' + Math.round((q.p / q.t) * 100) + '%;background:' + (q.d ? "#7ed08a" : "#ff8fb1") + '"></div></div><small>' + q.p + " / " + q.t + "</small>";
      box.appendChild(d);
    }
  }
  const qBtn = document.createElement("button");
  qBtn.textContent = "📋 Задания";
  qBtn.style.cssText = "margin-left:6px;border:none;border-radius:10px;background:#7ed08a;color:#fff;font-size:13px;padding:4px 10px";
  qBtn.onclick = () => { renderQ(); qBox.style.display = "flex"; };
  if (top) top.appendChild(qBtn);
  document.getElementById("qClose").onclick = () => { qBox.style.display = "none"; };
  const prevH4 = handleMessage;
  handleMessage = function (msg) {
    prevH4(msg);
    if (msg && msg.type === "state" && msg.house && Array.isArray(msg.house.quests)) {
      quests = msg.house.quests;
      if (qBox.style.display === "flex") renderQ();
    }
  };


  // ---------- Огонёк (серия дней) ----------
  const fire = document.createElement("button");
  fire.textContent = "🔥 0";
  fire.style.cssText = "margin-left:6px;border:none;border-radius:10px;background:#ff8a4c;color:#fff;font-size:13px;padding:4px 10px";
  if (top) top.appendChild(fire);
  const fBox = document.createElement("div");
  fBox.style.cssText = "position:fixed;inset:0;background:rgba(60,20,40,.65);display:none;z-index:40;align-items:center;justify-content:center";
  document.body.appendChild(fBox);
  let streak = { count: 0, broken: 0, left: 4 };
  let fShown = false;
  function renderFire() {
    const s = streak;
    if (s.broken) {
      fBox.innerHTML = '<div style="background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:16px;width:90%;max-width:340px;text-align:center"><div style="font-size:40px">🕯️</div><b style="font-size:17px">Огонёк погас!</b><p style="font-size:14px">Вы жили вместе ' + s.broken + " дн. и не заходили больше суток. Восстановить бесплатно можно ещё <b>" + s.left + ' из 4</b> раз за эту неделю.</p><button id="fRes" style="width:100%;border:none;border-radius:12px;background:#ff6f91;color:#fff;font-size:16px;padding:12px;margin-top:6px">🔥 Восстановить</button><button id="fNew" style="width:100%;border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:14px;padding:10px;margin-top:8px">Начать заново</button></div>';
      document.getElementById("fRes").onclick = () => { sendMsg({ type: "streak_restore" }); fBox.style.display = "none"; };
      document.getElementById("fNew").onclick = () => { sendMsg({ type: "streak_reset" }); fBox.style.display = "none"; };
    } else {
      fBox.innerHTML = '<div style="background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:16px;width:90%;max-width:340px;text-align:center"><div style="font-size:40px">🔥</div><b style="font-size:17px">Вместе уже ' + s.count + ' дн.</b><p style="font-size:14px">Заходите хотя бы раз в сутки, чтобы огонёк не погас. Если погаснет, его можно бесплатно восстановить 4 раза в неделю.</p><button id="fClose" style="width:100%;border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:16px;padding:10px">Закрыть</button></div>';
      document.getElementById("fClose").onclick = () => { fBox.style.display = "none"; };
    }
  }
  fire.onclick = () => { renderFire(); fBox.style.display = "flex"; };
  const prevH5 = handleMessage;
  handleMessage = function (msg) {
    prevH5(msg);
    if (msg && msg.type === "state" && msg.house && msg.house.streak) {
      streak = msg.house.streak;
      fire.textContent = (streak.broken ? "🕯️ " : "🔥 ") + (streak.broken || streak.count);
      if (streak.broken && !fShown) { fShown = true; renderFire(); fBox.style.display = "flex"; }
      if (!streak.broken && fBox.style.display === "flex" && !document.getElementById("fClose")) fBox.style.display = "none";
    }
  };


  // ---------- Парный танец (как DDR) ----------
  const NOTES_N = 32, GAP = 700, LEAD = 2000, FALL = 1500;
  const LANES = ["◀", "▼", "▲", "▶"];
  const LCOL = ["#ff6f91", "#6fa8ff", "#7ed08a", "#ffd24d"];
  const dBtn = document.createElement("button");
  dBtn.textContent = "💃 Танцы";
  dBtn.style.cssText = "margin-left:6px;border:none;border-radius:10px;background:#e06fd0;color:#fff;font-size:13px;padding:4px 10px";
  if (top) top.appendChild(dBtn);
  const dOv = document.createElement("div");
  dOv.style.cssText = "position:fixed;inset:0;background:rgba(40,15,50,.92);display:none;z-index:50;flex-direction:column;align-items:center;justify-content:center;gap:8px;touch-action:none";
  dOv.innerHTML = '<div id="dTitle" style="color:#fff;font-size:18px;font-weight:bold">💃 Танцуем вместе!</div><canvas id="dCan" width="280" height="300" style="background:#2a1838;border-radius:12px;border:3px solid #e06fd0"></canvas><div id="dRow" style="display:flex;gap:8px"></div><div id="dInfo" style="color:#fff;font-size:14px;min-height:36px;text-align:center;max-width:300px"></div><button id="dClose" style="display:none;border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:16px;padding:10px 24px">Закрыть</button>';
  document.body.appendChild(dOv);
  const dCan = dOv.querySelector("#dCan"), dc = dCan.getContext("2d");
  const dInfo = dOv.querySelector("#dInfo"), dClose = dOv.querySelector("#dClose");
  const dRow = dOv.querySelector("#dRow");
  let dance = null;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function press(l) {
    if (!dance || dance.over) return;
    const now = performance.now() - dance.t0;
    let best = null;
    for (const n of dance.notes) {
      if (n.l !== l || n.done) continue;
      const d = Math.abs(now - (n.t + FALL));
      if (d < 260 && (!best || d < best.d)) best = { n, d };
    }
    dance.flash[l] = now;
    if (best) { if (window.TLSfx) TLSfx.hit(); best.n.done = 1; dance.hits++; dance.msg = best.d < 110 ? "Идеально! ✨" : "Хорошо!"; dance.msgAt = now; }
    else { if (window.TLSfx) TLSfx.miss(); dance.msg = "Мимо"; dance.msgAt = now; }
  }
  LANES.forEach((a, i) => {
    const b = document.createElement("button");
    b.textContent = a;
    b.style.cssText = "width:62px;height:62px;border:none;border-radius:14px;font-size:30px;color:#fff;background:" + LCOL[i];
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); press(i); });
    dRow.appendChild(b);
  });
  window.addEventListener("keydown", (e) => {
    if (dOv.style.display === "none") return;
    const m = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 }[e.key];
    if (m !== undefined) { e.preventDefault(); e.stopPropagation(); press(m); }
  }, true);
  function drawDance(now) {
    if (!dance) return;
    const t = now - dance.t0;
    dc.clearRect(0, 0, 280, 300);
    const lw = 70, hitY = 250;
    for (let i = 0; i < 4; i++) {
      dc.fillStyle = i % 2 ? "#331f44" : "#2a1838";
      dc.fillRect(i * lw, 0, lw, 300);
      const fl = dance.flash[i] !== undefined && t - dance.flash[i] < 150;
      dc.fillStyle = fl ? LCOL[i] : "rgba(255,255,255,0.15)";
      dc.fillRect(i * lw + 6, hitY - 6, lw - 12, 12);
    }
    dc.font = "bold 34px sans-serif"; dc.textAlign = "center"; dc.textBaseline = "middle";
    for (const n of dance.notes) {
      if (n.done) continue;
      const y = hitY - (n.t + FALL - t) * (hitY / FALL);
      if (y < -20 || y > 330) continue;
      dc.fillStyle = LCOL[n.l];
      dc.fillText(LANES[n.l], n.l * lw + lw / 2, y);
    }
    dc.fillStyle = "#fff"; dc.font = "bold 14px sans-serif";
    dc.fillText("Очки: " + dance.hits + " / " + NOTES_N, 140, 14);
    if (dance.msg && t - dance.msgAt < 500) dc.fillText(dance.msg, 140, 40);
    if (t < 0) { dc.font = "bold 44px sans-serif"; dc.fillText(String(Math.ceil(-t / 1000)), 140, 130); }
    if (!dance.over && t > dance.end) {
      dance.over = true;
      sendMsg({ type: "dance_score", hits: dance.hits });
      dInfo.textContent = "Ждём партнёра… 💞";
    }
  }
  function dLoop(now) {
    if (dOv.style.display === "none") return;
    drawDance(now);
    requestAnimationFrame(dLoop);
  }
  function startDance(seed) {
    const R = rng(seed);
    const notes = [];
    for (let i = 0; i < NOTES_N; i++) notes.push({ t: LEAD + i * GAP, l: Math.floor(R() * 4), done: 0 });
    dance = { notes, hits: 0, flash: {}, over: false, msg: "", msgAt: 0, t0: performance.now() + 3000, end: LEAD + NOTES_N * GAP + FALL + 400 };
    dInfo.textContent = "Жми стрелки, когда они долетят до полоски!";
    dClose.style.display = "none";
    dOv.style.display = "flex";
    requestAnimationFrame(dLoop);
  }
  dClose.onclick = () => { dOv.style.display = "none"; dance = null; };
  dBtn.onclick = () => sendMsg({ type: "dance_invite" });
  const dAsk = document.createElement("div");
  dAsk.style.cssText = "position:fixed;left:10px;right:10px;bottom:90px;background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:12px;display:none;z-index:45;text-align:center";
  dAsk.innerHTML = '<div id="dAskT" style="font-size:15px;font-weight:bold;margin-bottom:8px"></div><button id="dYes" style="border:none;border-radius:12px;background:#e06fd0;color:#fff;font-size:16px;padding:10px 18px;margin:0 6px">Танцуем!</button><button id="dNo" style="border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:16px;padding:10px 18px;margin:0 6px">Не сейчас</button>';
  document.body.appendChild(dAsk);
  dAsk.querySelector("#dYes").onclick = () => { dAsk.style.display = "none"; sendMsg({ type: "dance_answer", ok: true }); };
  dAsk.querySelector("#dNo").onclick = () => { dAsk.style.display = "none"; sendMsg({ type: "dance_answer", ok: false }); };
  const prevH6 = handleMessage;
  handleMessage = function (msg) {
    prevH6(msg);
    if (!msg) return;
    if (msg.type === "dance_invite") {
      dAsk.querySelector("#dAskT").textContent = msg.name + " зовёт танцевать 💃";
      dAsk.style.display = "block";
      setTimeout(() => { dAsk.style.display = "none"; }, 28000);
    } else if (msg.type === "dance_start") {
      dAsk.style.display = "none";
      startDance(msg.seed);
    } else if (msg.type === "dance_end") {
      if (dance) dance.over = true;
      dInfo.textContent = msg.text;
      dClose.style.display = "inline-block";
    }
  };


  // ---------- Планировка дома (зеркальная) и меню ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const SNAP = { map: clone(LAYOUT.map), rugs: clone(LAYOUT.rugs), decor: clone(LAYOUT.decor), zones: clone(ZONES), spawn: clone(LAYOUT.spawn), items: LAYOUT.items.filter((i) => !i.sid).map((i) => { const c = clone(i); c.k = i.t + "_" + i.x + "_" + i.y; return c; }) };
  let moved = {};

  // ---------- Третья планировка: большая гостиная по центру ----------
  const PLAN2 = {
    map: [
      "####################",
      "#bbbbbb#llllll#cccc#",
      "#bbbbbb#llllll#cccc#",
      "#bbbbbbdllllll#cccc#",
      "#bbbbbb#lllllldcccc#",
      "#bbbbbb#llllll#cccc#",
      "###d####llllll#cccc#",
      "#kkkkkk#llllll#cccc#",
      "#kkkkkk#llllll#cccc#",
      "#kkkkkkdllllll######",
      "#kkkkkk#llllll######",
      "#kkkkkk#############",
      "#kkkkkk#############",
      "####################"
    ],
    rugs: [
      { x: 2, y: 3, w: 4, h: 2, border: "#cdb0df", body: "#a98ac6", inner: "#b79bd1" },
      { x: 2, y: 9, w: 4, h: 4, border: "#3f6b3f", body: "#4f8a4f", inner: "#5b9a58" },
      { x: 8, y: 3, w: 6, h: 5, border: "#e0bf8a", body: "#a23f3f", inner: "#b04a48" },
      { x: 15, y: 6, w: 4, h: 2, border: "#a3c7da", body: "#7fb0c9", inner: "#8dbcd3" }
    ],
    decor: [
      { t: "window", x: 2, y: 0, w: 2 },
      { t: "window", x: 10, y: 0, w: 2 },
      { t: "window", x: 16, y: 0, w: 2 },
      { t: "picture", x: 1, y: 6, w: 1 },
      { t: "shelf", x: 4, y: 6, w: 2 }
    ],
    zones: {
      stove: [{ x: 5, y: 7, w: 1, h: 1 }],
      bowl: [{ x: 6, y: 11, w: 1, h: 1 }],
      table: [{ x: 2, y: 10, w: 4, h: 2 }],
      bed: [{ x: 1, y: 1, w: 3, h: 2 }],
      clean: [{ x: 16, y: 3, w: 3, h: 1 }]
    },
    spawn: { caregiver: { x: 10.5, y: 3.5 }, receiver: { x: 12.5, y: 3.5 } },
    items: [
      { t: "bed", x: 1, y: 1, w: 3, h: 2 }, { t: "nightstand", x: 4, y: 1 }, { t: "wardrobe", x: 5, y: 1, w: 2 },
      { t: "dresser", x: 5, y: 5, w: 2 }, { t: "plant", x: 1, y: 5 },
      { t: "counter", x: 1, y: 7, w: 2 }, { t: "sink", x: 4, y: 7 }, { t: "stove", x: 5, y: 7 }, { t: "fridge", x: 6, y: 7 },
      { t: "table", x: 3, y: 10, w: 2, h: 2 },
      { t: "chair", x: 2, y: 10, dir: "right" }, { t: "chair", x: 2, y: 11, dir: "right" },
      { t: "chair", x: 5, y: 10, dir: "left" }, { t: "chair", x: 5, y: 11, dir: "left" },
      { t: "bowl", x: 6, y: 11, solid: false }, { t: "plant", x: 6, y: 12 },
      { t: "bookshelf", x: 8, y: 1, w: 2 }, { t: "lamp", x: 13, y: 5 },
      { t: "coffeetable", x: 10, y: 5, w: 2 }, { t: "sofa", x: 9, y: 8, w: 4 },
      { t: "plant", x: 8, y: 10 }, { t: "plant", x: 13, y: 10 },
      { t: "cabinet", x: 15, y: 1, w: 2 }, { t: "plant", x: 18, y: 1 },
      { t: "bucket", x: 16, y: 3 }, { t: "washer", x: 17, y: 3 }, { t: "basket", x: 18, y: 3 },
      { t: "shower", x: 18, y: 5 }, { t: "plant", x: 15, y: 8 }, { t: "plant", x: 18, y: 8 }
    ].map((i) => { i.w = i.w || 1; i.h = i.h || 1; if (i.solid === undefined) i.solid = true; i.k = i.t + "_" + i.x + "_" + i.y; return i; })
  };
  const keyOf = (k) => (curPlan === 2 ? "q_" + k : k);
  let curPlan = null;
  // применяем сохранённое положение (x, y, r) к предмету
  function pose(it, m) {
    const ow = it.ow || it.w, oh = it.oh || it.h;
    it.ow = ow; it.oh = oh;
    const r0 = m && m.r ? m.r : 0;
    if (m) { it.x = m.x; it.y = m.y; }
    it.w = r0 % 2 ? oh : ow;
    it.h = r0 % 2 ? ow : oh;
    it.rot = r0;
    if (curPlan === 1) { it.x = 20 - it.x - it.w; it.rot = (4 - r0) % 4; }
    return it;
  }
  const mx = (o) => Object.assign({}, o, { x: 20 - o.x - (o.w || 1) });
  function applyPlan(n, mirrorMe) {
    const f = n === 1;
    const SRC = n === 2 ? PLAN2 : SNAP;
    curPlan = n;
    LAYOUT.map = f ? SRC.map.map((row) => row.split("").reverse().join("")) : clone(SRC.map);
    LAYOUT.rugs = f ? SRC.rugs.map(mx) : clone(SRC.rugs);
    LAYOUT.decor = f ? SRC.decor.map(mx) : clone(SRC.decor);
    LAYOUT.items = SRC.items.map((i) => {
      const c = clone(i);
      pose(c, moved[keyOf(c.k)]);
      if (f) { if (c.dir === "left") c.dir = "right"; else if (c.dir === "right") c.dir = "left"; }
      return c;
    });
    LAYOUT.spawn = f ? { caregiver: { x: 20 - SRC.spawn.caregiver.x, y: SRC.spawn.caregiver.y }, receiver: { x: 20 - SRC.spawn.receiver.x, y: SRC.spawn.receiver.y } } : clone(SRC.spawn);
    for (const k of Object.keys(ZONES)) delete ZONES[k];
    for (const k of Object.keys(SRC.zones)) ZONES[k] = f ? SRC.zones[k].map(mx) : clone(SRC.zones[k]);
    if (mirrorMe) player.x = 20 - player.x;
    syncOwned();
    rebuildZones();
    buildBackground();
  }
  function rebuildZones() {
    const z = { stove: [], bowl: [], table: [], bed: [], clean: [] };
    for (const i of LAYOUT.items) {
      const rect = { x: i.x, y: i.y, w: i.w, h: i.h };
      if (i.sid) continue;
      if (i.t === "stove") z.stove.push(rect);
      else if (i.t === "bowl") z.bowl.push(rect);
      else if (i.t === "bed") z.bed.push(rect);
      else if (i.t === "table") z.table.push({ x: i.x - 1, y: i.y, w: i.w + 2, h: i.h });
      else if (i.t === "bucket" || i.t === "washer" || i.t === "basket") z.clean.push(rect);
    }
    for (const k of Object.keys(z)) ZONES[k] = z[k];
  }
  const planBtn = document.createElement("button");
  planBtn.textContent = "🏠 План дома";
  const PLANS = [["Уютный домик", "Кухня и спальня слева, гостиная и уборка справа"], ["Зеркальный домик", "То же самое, но наоборот"], ["Большая гостиная", "Гостиная в центре, комнаты по бокам"]];
  const pBox = document.createElement("div");
  pBox.style.cssText = "position:fixed;inset:0;background:rgba(60,20,40,.65);display:none;z-index:40;align-items:center;justify-content:center";
  document.body.appendChild(pBox);
  function renderPlans() {
    pBox.innerHTML = '<div style="background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:14px;width:92%;max-width:360px;text-align:center"><b style="font-size:18px">🏠 Выбери планировку</b><div id="pList"></div><button id="pClose" style="margin-top:10px;border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:16px;padding:10px 20px">Закрыть</button></div>';
    const list = pBox.querySelector("#pList");
    PLANS.forEach((p, i) => {
      const b = document.createElement("button");
      const on = (curPlan || 0) === i;
      b.style.cssText = "display:block;width:100%;margin:8px 0;text-align:left;border-radius:12px;padding:10px;font-size:14px;color:#6b2d45;background:" + (on ? "#ffe0ea" : "#fff") + ";border:3px solid " + (on ? "#ff6f91" : "#e0a0b8");
      b.innerHTML = "<b>" + (i + 1) + ". " + p[0] + (on ? " ✅" : "") + "</b><br><small>" + p[1] + "</small>";
      b.onclick = () => { pBox.style.display = "none"; if (!on) sendMsg({ type: "set_plan", plan: i }); };
      list.appendChild(b);
    });
    pBox.querySelector("#pClose").onclick = () => { pBox.style.display = "none"; };
  }
  planBtn.onclick = () => { renderPlans(); pBox.style.display = "flex"; };
  const prevH7 = handleMessage;
  handleMessage = function (msg) {
    if (msg && msg.type === "state" && msg.house && msg.house.moved) {
      const str = JSON.stringify(msg.house.moved);
      if (str !== JSON.stringify(moved)) {
        moved = msg.house.moved;
        if (curPlan !== null && msg.house.plan === curPlan) { applyPlan(curPlan, false); posHi(); }
      }
    }
    if (msg && msg.type === "state" && msg.house && typeof msg.house.plan === "number" && msg.house.plan !== curPlan) {
      const prevP = curPlan;
      applyPlan(msg.house.plan, prevP !== null && prevP !== 2 && msg.house.plan !== 2);
      if (prevP !== null && (prevP === 2 || msg.house.plan === 2) && msg.players && msg.players[myRole]) {
        player.x = msg.players[myRole].x; player.y = msg.players[myRole].y;
      }
    }
    prevH7(msg);
  };


  // поворот мебели: у каждой вещи рисуем нужную сторону
  const scratch = document.createElement("canvas");
  scratch.width = 10 * T; scratch.height = 9 * T;
  const sctx = scratch.getContext("2d");
  const SYM = ["plant", "lamp", "pouf", "bucket", "basket", "bowl", "chair"];
  const FPAL = {
    sofa: { dark: "#2a4a80", seat: "#3d6bb0", back: "#2f5490", arm: "#34609f" },
    armchair: { dark: "#76497b", seat: "#b88fbd", back: "#8a5a8f", arm: "#a577aa" }
  };
  const BODY = {
    bookshelf: ["#7a4a2a", 14], wardrobe: ["#8a5a2c", 10], dresser: ["#9a6a3a", 0], nightstand: ["#a4733f", 0],
    table: ["#a8744c", 0], coffeetable: ["#a8744c", 0], tvstand: ["#6b4a2c", 0], tv: ["#22252e", 10],
    cabinet: ["#5f8a9a", 0], counter: ["#d9c19a", 0], sink: ["#d9c19a", 0], stove: ["#7d8087", 0], fridge: ["#dfe4ea", 12],
    washer: ["#f0f0f4", 0], shower: ["#b9d4e0", 14], aquarium: ["#5a8fb0", 0], fireplace: ["#8b8b92", 14]
  };
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return "#" + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function sofaLike(x, y, w, h, rot, p) {
    const W = w * T, H = h * T, dir = ["down", "left", "up", "right"][rot];
    r(x, y, W, H, p.dark);
    let seat, back, arms;
    if (dir === "up") { seat = [x + 3, y, W - 6, H - 6]; back = [x, y + H - 7, W, 7]; arms = [[x, y, 3, H - 6], [x + W - 3, y, 3, H - 6]]; }
    else if (dir === "left") { seat = [x, y + 3, W - 5, H - 6]; back = [x + W - 5, y, 5, H]; arms = [[x, y, W - 5, 3], [x, y + H - 3, W - 5, 3]]; }
    else if (dir === "right") { seat = [x + 5, y + 3, W - 5, H - 6]; back = [x, y, 5, H]; arms = [[x + 5, y, W - 5, 3], [x + 5, y + H - 3, W - 5, 3]]; }
    else { seat = [x + 3, y + 5, W - 6, H - 5]; back = [x, y, W, 5]; arms = [[x, y + 5, 3, H - 5], [x + W - 3, y + 5, 3, H - 5]]; }
    r(seat[0], seat[1], seat[2], seat[3], p.seat);
    const longH = W >= H;
    for (let i = 1; i < Math.round((longH ? W : H) / T); i++) {
      if (longH) r(seat[0] + i * T - 1 - (seat[0] - x), seat[1], 1, seat[3], p.dark); else r(seat[0], seat[1] + i * T - 1 - (seat[1] - y), seat[2], 1, p.dark);
    }
    for (const a of arms) r(a[0], a[1], a[2], a[3], p.arm);
    r(back[0], back[1], back[2], back[3], p.back);
    if (dir === "up") r(back[0], back[1], back[2], 1, shade(p.back, 1.25)); else r(back[0], back[1], back[2], 1, shade(p.back, 1.25));
  }
  function bedRot(x, y, w, h, rot) {
    const W = w * T, H = h * T;
    r(x, y, W, H, "#7a4a2a");
    r(x + 1, y + 1, W - 2, H - 2, "#f2ece0");
    const head = ["W", "N", "E", "S"][rot];
    const hz = head === "W" || head === "E";
    const L = hz ? W : H, C = hz ? H : W;
    // рисуем в локальных координатах (вдоль кровати u, поперёк v), потом переводим
    const px = (u, v, du, dv, col) => {
      let ru = head === "W" || head === "N" ? u : L - u - du;
      let X, Y, WW, HH;
      if (hz) { X = x + ru; Y = y + v; WW = du; HH = dv; } else { X = x + v; Y = y + ru; WW = dv; HH = du; }
      r(X, Y, WW, HH, col);
    };
    px(1, 1, 4, C - 2, "#8f5b30");
    px(1, 1, 4, 1, "#b07840");
    const np = Math.max(1, Math.round(C / 22));
    for (let i = 0; i < np; i++) { const v = 3 + i * Math.floor((C - 6) / np); px(6, v, 10, Math.floor((C - 6) / np) - 2, "#ffffff"); }
    px(18, 1, L - 20, C - 2, "#e0839c");
    px(18, 1, 4, C - 2, "#f0a9bb");
    for (let u = 30; u < L - 4; u += 8) px(u, 1, 2, C - 2, "#cf7189");
  }
  function plainBox(name, x, y, w, h, rot) {
    const [col, hh] = BODY[name];
    const W = w * T, H = h * T;
    if (name === "tv") { r(x + W / 2 - 2, y - 10, 4, 14 + (h - 1) * T, "#22252e"); r(x + W / 2 - 2, y - 10, 4, 1, "#3a3e4a"); return; }
    r(x + 1, y - hh, W - 2, H + hh, col);
    r(x + 1, y - hh, W - 2, 3, shade(col, 1.25));
    r(x + 1, y + H - 3, W - 2, 3, shade(col, 0.78));
    r(x + 1, y - hh, 1, H + hh, shade(col, 0.9));
    if (rot === 2) { /* вид сзади: гладкая стенка */ }
  }
  const silCache = {};
  function silhouette(name, orig, ow, oh, it) {
    const key = name + ow + "x" + oh;
    if (silCache[key]) return silCache[key];
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    const saveG = g; g = sctx; orig(0, T, ow, oh, it); g = saveG;
    const W = ow * T, H = (oh + 1) * T;
    const img = sctx.getImageData(0, 0, W, H);
    const col = BODY[name][0];
    let minY = H, maxY = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 0) { const yy = Math.floor(i / 4 / W); if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
    const n = parseInt(col.slice(1), 16);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c2 = cv.getContext("2d");
    const out = c2.createImageData(W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] === 0) continue;
      const yy = Math.floor(i / 4 / W), t = (yy - minY) / Math.max(1, maxY - minY);
      const k = t < 0.12 ? 1.25 : t > 0.85 ? 0.78 : 1;
      out.data[i] = Math.min(255, ((n >> 16) & 255) * k); out.data[i + 1] = Math.min(255, ((n >> 8) & 255) * k); out.data[i + 2] = Math.min(255, (n & 255) * k); out.data[i + 3] = 255;
    }
    c2.putImageData(out, 0, 0);
    silCache[key] = cv;
    return cv;
  }
  for (const name of Object.keys(SPR)) {
    const orig = SPR[name];
    SPR[name] = function (x, y, w, h, it) {
      if (!it || !it.rot) return orig(x, y, w, h, it);
      const ow = it.ow || w, oh = it.oh || h, rot = it.rot;
      if (SYM.includes(name)) return orig(x, y, ow, oh, it);
      if (name === "sofa" || name === "armchair") return sofaLike(x, y, w, h, rot, FPAL[name]);
      if (name === "bed") return bedRot(x, y, w, h, rot);
      if (BODY[name]) {
        if (rot === 2) { ctx.drawImage(silhouette(name, orig, ow, oh, it), x, y - T); return; }
        return plainBox(name, x, y, w, h, rot);
      }
      // запасной вариант: поворот картинки
      sctx.clearRect(0, 0, scratch.width, scratch.height);
      const saveG = g; g = sctx; orig(0, T, ow, oh, it); g = saveG;
      const cx = x + (w * T) / 2, cy = y + (h * T) / 2;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(cx), Math.round(cy)); ctx.rotate((rot * Math.PI) / 2);
      ctx.drawImage(scratch, -Math.round((ow * T) / 2), -Math.round(T + (oh * T) / 2)); ctx.restore();
    };
  }

  // ---------- Двигать мебель ----------
  const LOCK = [];
  const TALL = ["bookshelf", "fireplace", "tv"];
  let editOn = false, sel = null;
  const hi = document.createElement("div");
  hi.style.cssText = "position:fixed;border:3px dashed #ff3d7f;background:rgba(255,61,127,.15);pointer-events:none;display:none;z-index:20";
  document.body.appendChild(hi);
  const ep = document.createElement("div");
  ep.style.cssText = "position:fixed;left:0;right:0;bottom:0;background:#fff8f0;border-top:3px solid #6b2d45;border-radius:16px 16px 0 0;padding:10px 12px 14px;display:none;z-index:35;text-align:center;font-size:14px";
  ep.innerHTML = '<div id="eHint" style="margin-bottom:6px"></div><div id="eArr" style="display:inline-grid;grid-template-columns:repeat(3,54px);gap:5px"></div><div style="margin-top:8px"><button id="eDone" style="border:none;border-radius:12px;background:#ff6f91;color:#fff;font-size:15px;padding:9px 18px;margin:3px">Готово ✅</button><button id="eRot" style="border:none;border-radius:12px;background:#6fa8ff;color:#fff;font-size:15px;padding:9px 14px;margin:3px">🔄 Повернуть</button><button id="eReset" style="border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:13px;padding:9px 12px;margin:3px">Всё как было</button></div>';
  document.body.appendChild(ep);
  const eArr = ep.querySelector("#eArr"), eHint = ep.querySelector("#eHint");
  function itemByKey(k) { return LAYOUT.items.find((i) => i.k === k); }
  function posHi() {
    const it = sel && itemByKey(sel);
    if (!editOn || !it) { hi.style.display = "none"; return; }
    const rc = canvas.getBoundingClientRect();
    const sc = rc.width / canvas.width;
    const top0 = TALL.includes(it.t) && !it.rot ? it.y - 1 : it.y;
    hi.style.left = rc.left + it.x * T * sc + "px";
    hi.style.top = rc.top + top0 * T * sc + "px";
    hi.style.width = it.w * T * sc + "px";
    hi.style.height = (it.y + it.h - top0) * T * sc + "px";
    hi.style.display = "block";
  }
  function canPlace(it, nx, ny, nw, nh, excl) {
    nw = nw || it.w; nh = nh || it.h;
    for (let tx = nx; tx < nx + nw; tx++) for (let ty = ny; ty < ny + nh; ty++) {
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
      const c = tileAt(tx, ty);
      if (c === "#" || c === "d") return false;
    }
    if (it.solid) {
      const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const me = { x: nx, y: ny, w: nw, h: nh };
      for (const o of LAYOUT.items) if (o !== it && !(excl && excl.has(o)) && o.solid && ov(me, o)) return false;
      for (const pl of [player, partner]) if (pl && ov(me, { x: Math.floor(pl.x), y: Math.floor(pl.y), w: 1, h: 1 })) return false;
    }
    return true;
  }
  function setPose(nx, ny, nr, nw, nh) {
    const it = sel && itemByKey(sel);
    if (!it) return;
    if (!canPlace(it, nx, ny, nw, nh)) { showToast("Сюда нельзя 🚫"); return; }
    const key = keyOf(sel === "tv" ? "tvs" : sel);
    const cx = curPlan === 1 ? 20 - nx - nw : nx;
    moved[key] = { x: cx, y: ny, r: nr };
    applyPlan(curPlan, false);
    posHi();
    sendMsg({ type: "move_item", id: key, x: cx, y: ny, r: nr });
  }
  function canonRot(it) { return curPlan === 1 ? (4 - (it.rot || 0)) % 4 : it.rot || 0; }
  function nudge(dx, dy) {
    const it = sel && itemByKey(sel);
    if (!it) return;
    const mem = it.t === "table" ? LAYOUT.items.filter((i) => i.t === "table" || i.t === "chair") : [it];
    const set = new Set(mem);
    for (let d = 1; d <= 3; d++) {
      if (!mem.every((m) => canPlace(m, m.x + dx * d, m.y + dy * d, m.w, m.h, set))) continue;
      for (const m of mem) {
        const nx = m.x + dx * d, ny = m.y + dy * d;
        const cx = curPlan === 1 ? 20 - nx - m.w : nx;
        const key = keyOf(m.sid === "tv" ? "tvs" : m.k);
        moved[key] = { x: cx, y: ny, r: canonRot(m) };
        sendMsg({ type: "move_item", id: key, x: cx, y: ny, r: canonRot(m) });
      }
      applyPlan(curPlan, false);
      posHi();
      return;
    }
    showToast("Сюда нельзя 🚫");
  }
  function rotate() {
    const it = sel && itemByKey(sel);
    if (!it) return;
    if (it.t === "table") { showToast("Стол со стульями не поворачивается 🪑"); return; }
    const nr = (canonRot(it) + 1) % 4;
    const ow = it.ow || it.w, oh = it.oh || it.h;
    setPose(it.x, it.y, nr, nr % 2 ? oh : ow, nr % 2 ? ow : oh);
  }
  [["", 0, 0], ["▲", 0, -1], ["", 0, 0], ["◀", -1, 0], ["▼", 0, 1], ["▶", 1, 0]].forEach(([a, dx, dy]) => {
    const b = document.createElement("button");
    b.textContent = a;
    b.style.cssText = "height:48px;border:none;border-radius:12px;font-size:22px;color:#fff;background:" + (a ? "#ff8fb1" : "transparent");
    if (a) b.onclick = () => nudge(dx, dy);
    eArr.appendChild(b);
  });
  function setEdit(on) {
    editOn = on; sel = null;
    ep.style.display = on ? "block" : "none";
    eHint.textContent = "Нажми на мебель, потом двигай стрелками 👆";
    posHi();
  }
  ep.querySelector("#eRot").onclick = rotate;
  ep.querySelector("#eDone").onclick = () => setEdit(false);
  ep.querySelector("#eReset").onclick = () => { moved = {}; applyPlan(curPlan, false); sel = null; posHi(); sendMsg({ type: "reset_layout" }); };
  canvas.addEventListener("pointerdown", (e) => {
    if (!editOn) return;
    e.stopPropagation();
    const rc = canvas.getBoundingClientRect();
    const tx = Math.floor(((e.clientX - rc.left) / rc.width) * COLS);
    const ty = Math.floor(((e.clientY - rc.top) / rc.height) * ROWS);
    let hit = null;
    for (const it of LAYOUT.items) {
      if (tx >= it.x && tx < it.x + it.w && (ty >= it.y && ty < it.y + it.h || !it.rot && TALL.includes(it.t) && ty === it.y - 1)) hit = it;
    }
    if (!hit) { sel = null; posHi(); return; }
    if (hit.t === "chair") hit = LAYOUT.items.find((i) => i.t === "table") || hit;
    if (LOCK.includes(hit.t)) { showToast("Это двигать нельзя: на нём держится игра 🔒"); return; }
    sel = hit.sid === "tv" ? "tvs" : hit.k;
    eHint.textContent = "Выбрано. Двигай стрелками 👇";
    posHi();
  }, true);
  window.addEventListener("resize", posHi);
  const editBtn = document.createElement("button");
  editBtn.textContent = "🛋️ Двигать мебель";
  editBtn.style.cssText = "border:none;border-radius:10px;background:#8fbf8f;color:#fff";
  editBtn.onclick = () => setEdit(true);

  // меню: прячем лишние кнопки
  const menu = document.createElement("div");
  menu.style.cssText = "position:fixed;top:44px;right:8px;background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:8px;display:none;flex-direction:column;gap:6px;z-index:25;min-width:170px";
  document.body.appendChild(menu);
  const menuBtn = document.createElement("button");
  menuBtn.textContent = "☰ Меню";
  menuBtn.style.cssText = "margin-left:6px;border:none;border-radius:10px;background:#6b2d45;color:#fff;font-size:13px;padding:4px 10px";
  menuBtn.onclick = () => { menu.style.display = menu.style.display === "flex" ? "none" : "flex"; };
  for (const b of [document.getElementById("inviteBtn"), shopBtn, editBtn, qBtn, dBtn, planBtn, document.getElementById("themeBtn")]) {
    if (!b) continue;
    b.style.margin = "0";
    b.style.fontSize = "15px";
    b.style.padding = "9px 12px";
    b.addEventListener("click", () => { menu.style.display = "none"; });
    menu.appendChild(b);
  }
  if (top) top.appendChild(menuBtn);


  // ---------- Игра открыта в другом окне ----------
  const prevH8 = handleMessage;
  handleMessage = function (msg) {
    if (msg && msg.type === "kicked") {
      try { ws.onclose = () => {}; ws.close(); } catch (e) {}
      const k = document.createElement("div");
      k.style.cssText = "position:fixed;inset:0;background:#ffe4ec;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px";
      k.innerHTML = '<div style="background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:18px;max-width:340px;text-align:center;color:#6b2d45"><div style="font-size:40px">🪟</div><b style="font-size:17px">Игра открыта в другом окне</b><p style="font-size:14px">Закрой лишние окна или вкладки с игрой. Если хочешь играть здесь, нажми кнопку.</p><button id="kBtn" style="width:100%;border:none;border-radius:12px;background:#ff6f91;color:#fff;font-size:17px;padding:12px">Играть здесь</button></div>';
      document.body.appendChild(k);
      document.getElementById("kBtn").onclick = () => location.reload();
      return;
    }
    prevH8(msg);
  };


  // ---------- Звуки, музыка, анимации, достижения ----------
  let sndOn = true, musOn = false;
  try { sndOn = localStorage.getItem("tl_snd") !== "0"; musOn = localStorage.getItem("tl_mus") === "1"; } catch (e) {}
  let AC = null;
  function actx() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  function tone(f, d, type, vol, delay) {
    const a = actx();
    if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator(), gn = a.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(gn); gn.connect(a.destination);
    o.start(t0); o.stop(t0 + d + 0.05);
  }
  const SFX = {
    tick: () => tone(660, 0.05, "triangle", 0.03),
    coin: () => { tone(988, 0.08, "square", 0.04); tone(1319, 0.2, "square", 0.04, 0.08); },
    ok: () => { tone(523, 0.12, "triangle", 0.06); tone(659, 0.12, "triangle", 0.06, 0.1); tone(784, 0.2, "triangle", 0.06, 0.2); },
    bad: () => { tone(220, 0.15, "sawtooth", 0.04); tone(165, 0.2, "sawtooth", 0.04, 0.12); },
    heart: () => { tone(784, 0.15, "sine", 0.06); tone(988, 0.25, "sine", 0.06, 0.12); },
    win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.06, i * 0.12)); },
    hit: () => tone(880, 0.1, "triangle", 0.06),
    miss: () => tone(180, 0.1, "sawtooth", 0.03)
  };
  window.TLSfx = { hit: () => sndOn && SFX.hit(), miss: () => sndOn && SFX.miss() };
  const play = (n) => { if (sndOn) SFX[n](); };
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("button")) play("tick"); }, true);
  window.addEventListener("pointerdown", () => actx(), { once: true });
  // музыка: мягкая мелодия
  const SC = [262, 294, 330, 392, 440, 523];
  const MEL = [0, 2, 3, 2, 4, 3, 2, 0, 1, 2, 3, 5, 4, 3, 2, 1];
  let mi = 0;
  setInterval(() => {
    if (!musOn || document.hidden) return;
    const n = MEL[mi % MEL.length];
    tone(SC[n], 0.7, "sine", 0.018);
    if (mi % 4 === 0) tone(SC[n] / 2, 1.6, "triangle", 0.015);
    mi++;
  }, 520);
  function floatFx(em, n) {
    const fr = document.getElementById("frame");
    if (!fr) return;
    for (let i = 0; i < n; i++) {
      const el = document.createElement("span");
      el.textContent = em;
      el.style.cssText = "position:absolute;pointer-events:none;font-size:22px;z-index:6;left:" + (15 + Math.random() * 70) + "%;bottom:" + (20 + Math.random() * 20) + "%";
      fr.appendChild(el);
      const a = el.animate([{ transform: "translateY(0) scale(.6)", opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: "translateY(-90px) scale(1.2)", opacity: 0 }], { duration: 1300 + Math.random() * 600, delay: i * 120 });
      a.onfinish = () => el.remove();
    }
  }
  const prevH9 = handleMessage;
  handleMessage = function (msg) {
    prevH9(msg);
    if (msg && (msg.type === "toast" || msg.type === "dance_end") && msg.text) {
      const t = msg.text;
      if (t.includes("🏆")) { play("win"); floatFx("🏆", 3); floatFx("🎉", 4); }
      else if (t.includes("🎯")) { play("ok"); floatFx("🎯", 3); }
      else if (t.includes("🪙") && t.includes("+")) { play("coin"); floatFx("🪙", 4); }
      else if (t.includes("🚫") || t.includes("Не хватает") || t.includes("нельзя")) play("bad");
      else if (t.includes("❤️")) { play("heart"); floatFx("❤️", 5); }
      else if (t.includes("✨")) { play("ok"); floatFx("✨", 5); }
      else if (t.includes("🍽️") || t.includes("Ням")) { play("ok"); floatFx("😋", 2); }
    }
  };
  // кнопки в меню
  function menuToggle(label, get, set) {
    const b = document.createElement("button");
    const paintB = () => { b.textContent = label + (get() ? ": вкл" : ": выкл"); };
    b.style.cssText = "margin:0;font-size:15px;padding:9px 12px;border:none;border-radius:10px;background:#8fa6d9;color:#fff";
    b.onclick = (e) => { e.stopPropagation(); set(!get()); paintB(); actx(); };
    paintB();
    menu.appendChild(b);
  }
  menuToggle("🔊 Звуки", () => sndOn, (v) => { sndOn = v; try { localStorage.setItem("tl_snd", v ? "1" : "0"); } catch (e) {} });
  menuToggle("🎵 Музыка", () => musOn, (v) => { musOn = v; try { localStorage.setItem("tl_mus", v ? "1" : "0"); } catch (e) {} });
  // достижения
  let achs = [];
  const aBox = document.createElement("div");
  aBox.style.cssText = "position:fixed;inset:0;background:rgba(60,20,40,.6);display:none;z-index:30;align-items:center;justify-content:center";
  aBox.innerHTML = '<div style="background:#fff8f0;border:3px solid #6b2d45;border-radius:14px;padding:14px;width:92%;max-width:360px;max-height:85%;overflow:auto;text-align:center"><b style="font-size:18px">🏆 Достижения</b><div id="aList"></div><button id="aClose" style="margin-top:10px;border:none;border-radius:12px;background:#b79bd1;color:#fff;font-size:16px;padding:10px 20px">Закрыть</button></div>';
  document.body.appendChild(aBox);
  function renderA() {
    const box = document.getElementById("aList");
    box.innerHTML = "";
    const done = achs.filter((a) => a.d).length;
    const h = document.createElement("div");
    h.style.cssText = "font-size:12px;margin:4px 0 8px";
    h.textContent = "Получено: " + done + " из " + achs.length + ". Награда падает в общий счёт 🪙";
    box.appendChild(h);
    for (const a of achs) {
      const d = document.createElement("div");
      d.style.cssText = "text-align:left;margin:7px 0;font-size:14px;opacity:" + (a.d ? 1 : 0.85);
      d.innerHTML = (a.d ? "🏆 " : "🔒 ") + a.n + " <b>+" + a.r + " 🪙</b>" + '<div style="height:7px;background:#f3d3de;border-radius:5px;overflow:hidden;margin-top:3px"><div style="height:100%;width:' + Math.round((a.p / a.t) * 100) + '%;background:' + (a.d ? "#7ed08a" : "#ff8fb1") + '"></div></div><small>' + a.p + " / " + a.t + "</small>";
      box.appendChild(d);
    }
  }
  const aBtn = document.createElement("button");
  aBtn.textContent = "🏆 Достижения";
  aBtn.style.cssText = "margin:0;font-size:15px;padding:9px 12px;border:none;border-radius:10px;background:#e0a030;color:#fff";
  aBtn.onclick = () => { renderA(); aBox.style.display = "flex"; menu.style.display = "none"; };
  menu.insertBefore(aBtn, menu.children[3] || null);
  document.getElementById("aClose").onclick = () => { aBox.style.display = "none"; };
  const prevH10 = handleMessage;
  handleMessage = function (msg) {
    prevH10(msg);
    if (msg && msg.type === "state" && msg.house && Array.isArray(msg.house.ach)) {
      achs = msg.house.ach;
      if (aBox.style.display === "flex") renderA();
    }
  };

  window.TLMini = { getGame: () => game, startCook, startScrub, cookStop };
})();
