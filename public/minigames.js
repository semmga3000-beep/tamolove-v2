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
    { id: "plant1", n: "Цветок у кухни", e: "🪴", c: 3, it: { t: "plant", x: 9, y: 1 } },
    { id: "plant2", n: "Цветок в гостиной", e: "🪴", c: 3, it: { t: "plant", x: 11, y: 2 } },
    { id: "plant3", n: "Цветок в спальне", e: "🌿", c: 3, it: { t: "plant", x: 9, y: 8 } },
    { id: "lamp1", n: "Торшер в гостиной", e: "💡", c: 4, it: { t: "lamp", x: 18, y: 2 } },
    { id: "lamp2", n: "Лампа в спальне", e: "💡", c: 4, it: { t: "lamp", x: 5, y: 8 } },
    { id: "night", n: "Тумбочка у кровати", e: "🗄️", c: 5, it: { t: "nightstand", x: 1, y: 11 } },
    { id: "tvs", n: "Тумба под телевизор", e: "📺", c: 6, it: { t: "tvstand", x: 14, y: 1, w: 2 } },
    { id: "tv", n: "Телевизор (нужна тумба)", e: "📺", c: 10, need: "tvs", it: { t: "tv", x: 14, y: 1, w: 2, solid: false } }
  ];
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
    r(x + 3, y - 10, W - 6, 14, "#22252e");
    r(x + 5, y - 8, W - 10, 9, "#6fb6d8");
    r(x + 6, y - 7, 6, 2, "#c8ecfa");
    r(x + W / 2 - 3, y + 3, 6, 2, "#22252e");
  };
  // тумбочки вдоль стены, камин правее
  for (const i of LAYOUT.items) {
    if (i.t === "nightstand" && i.x === 4 && i.y === 9 && !i.sid) { i.x = 1; i.y = 8; }
    else if (i.t === "fireplace") i.x = 16;
  }
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
  }
  function syncOwned() {
    for (const c of CATALOG) {
      if (owned.includes(c.id) && !LAYOUT.items.some((i) => i.sid === c.id)) {
        LAYOUT.items.push(Object.assign({ w: 1, h: 1, solid: true, sid: c.id }, c.it));
      }
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
  drawCharacter = function (c, look, sleeping) {
    const type = look.type || "human";
    const style = look.style || "short";
    const px = Math.round(c.x * T - 5);
    const py = Math.round(c.y * T - 10);
    ctx.globalAlpha = sleeping ? 0.55 : type === "ghost" ? 0.85 : 1;
    r(px, py + 15, 10, 3, "rgba(0,0,0,0.18)");
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
      r(px + 2, py + 12, 2, 4, look.pants);
      r(px + 6, py + 12, 2, 4, look.pants);
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

  window.TLMini = { getGame: () => game, startCook, startScrub, cookStop };
})();
