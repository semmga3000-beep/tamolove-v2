// Мониторинг TamoLove: кто онлайн, сколько людей заходит по дням и месяцам.
// Страница: https://<сайт>/stats?key=ТВОЙ_КЛЮЧ  (ключ задаётся в Render: STATS_KEY)
const crypto = require("crypto");

const OFFSET = 5 * 3600 * 1000; // Екатеринбург, UTC+5
const SAMPLE_EVERY = 5 * 60 * 1000;
const KEEP_SAMPLES = 8 * 24 * 12; // 8 суток по 5 минут

let days = {}; // "2026-11-21" -> { seen:{ключ:1}, sessions, peak }
let first = {}; // ключ игрока -> день первого входа
let samples = []; // [время, онлайн, гостей]
let dirty = false;
let ctx = () => ({});

const dayKey = (t) => new Date((t || Date.now()) + OFFSET).toISOString().slice(0, 10);
function today() {
  const d = dayKey();
  if (!days[d]) days[d] = { seen: {}, sessions: 0, peak: 0 };
  return days[d];
}

function countOnline() {
  const c = ctx();
  let n = 0, houses = 0, guests = 0;
  for (const code of Object.keys(c.live || {})) {
    let any = false;
    for (const role of ["caregiver", "receiver"]) {
      const s = c.live[code][role];
      if (s && s.readyState === 1) { n++; any = true; }
    }
    if (any) houses++;
  }
  for (const code of Object.keys(c.GUESTS || {})) {
    for (const id of Object.keys(c.GUESTS[code])) {
      const g = c.GUESTS[code][id];
      if (g.ws && g.ws.readyState === 1) guests++;
    }
  }
  return { n, houses, guests };
}

function seen(code, role) {
  const key = code + ":" + role;
  const t = today();
  t.seen[key] = 1;
  t.sessions += 1;
  if (!first[key]) first[key] = dayKey();
  const o = countOnline();
  if (o.n > t.peak) t.peak = o.n;
  dirty = true;
}

async function load() {
  const c = ctx();
  if (!c.pool) return;
  try {
    await c.pool.query("CREATE TABLE IF NOT EXISTS stats (k TEXT PRIMARY KEY, data JSONB NOT NULL)");
    const r = await c.pool.query("SELECT k, data FROM stats");
    for (const row of r.rows) {
      if (row.k === "days") days = row.data || {};
      else if (row.k === "first") first = row.data || {};
      else if (row.k === "samples") samples = row.data || [];
    }
  } catch (e) {
    console.log("Статистика: не удалось загрузить:", e.message);
  }
}

async function save() {
  const c = ctx();
  if (!c.pool || !dirty) return;
  dirty = false;
  try {
    for (const [k, v] of [["days", days], ["first", first], ["samples", samples]]) {
      await c.pool.query(
        "INSERT INTO stats (k, data) VALUES ($1, $2::jsonb) ON CONFLICT (k) DO UPDATE SET data = EXCLUDED.data",
        [k, JSON.stringify(v)]
      );
    }
  } catch (e) {
    dirty = true;
    console.log("Статистика: не удалось сохранить:", e.message);
  }
}

function sample() {
  const o = countOnline();
  samples.push([Date.now(), o.n, o.guests]);
  if (samples.length > KEEP_SAMPLES) samples = samples.slice(-KEEP_SAMPLES);
  const t = today();
  if (o.n > t.peak) t.peak = o.n;
  dirty = true;
}

function build() {
  const c = ctx();
  const o = countOnline();
  const houses = c.houses || {};
  let players = 0, withFriends = 0;
  const plans = [0, 0, 0];
  for (const code of Object.keys(houses)) {
    const h = houses[code];
    for (const r of ["caregiver", "receiver"]) if (h.players && h.players[r]) players++;
    if (h.friends && h.friends.length) withFriends++;
    plans[h.plan || 0] = (plans[h.plan || 0] || 0) + 1;
  }
  const now = Date.now();
  const list = [];
  for (let i = 59; i >= 0; i--) list.push(dayKey(now - i * 86400000));
  const uniq = (n) => {
    const s = {};
    for (const d of list.slice(-n)) if (days[d]) for (const k of Object.keys(days[d].seen)) s[k] = 1;
    return Object.keys(s).length;
  };
  const newIn = (n) => {
    const set = new Set(list.slice(-n));
    return Object.values(first).filter((d) => set.has(d)).length;
  };
  const newBy = {};
  for (const k of Object.keys(first)) newBy[first[k]] = (newBy[first[k]] || 0) + 1;
  const daily = list.map((d) => ({
    d,
    users: days[d] ? Object.keys(days[d].seen).length : 0,
    sessions: days[d] ? days[d].sessions : 0,
    peak: days[d] ? days[d].peak : 0,
    new: newBy[d] || 0
  }));
  // по месяцам (все накопленные данные)
  const months = {};
  const allDays = Object.keys(days).sort();
  for (const d of allDays) {
    const m = d.slice(0, 7);
    if (!months[m]) months[m] = { m, set: {}, sessions: 0, new: 0 };
    for (const k of Object.keys(days[d].seen)) months[m].set[k] = 1;
    months[m].sessions += days[d].sessions;
  }
  for (const k of Object.keys(first)) {
    const m = first[k].slice(0, 7);
    if (!months[m]) months[m] = { m, set: {}, sessions: 0, new: 0 };
    months[m].new += 1;
  }
  const monthly = Object.keys(months).sort().slice(-12).map((m) => ({ m, users: Object.keys(months[m].set).length, sessions: months[m].sessions, new: months[m].new }));
  return {
    now,
    online: o.n,
    guests: o.guests,
    housesOnline: o.houses,
    totals: { houses: Object.keys(houses).length, players, withFriends, plans, everSeen: Object.keys(first).length },
    dau: uniq(1),
    wau: uniq(7),
    mau: uniq(30),
    newToday: newIn(1),
    newWeek: newIn(7),
    newMonth: newIn(30),
    peakToday: today().peak,
    daily,
    monthly,
    samples: samples.filter((s) => s[0] > now - 8 * 86400000).map((s) => [s[0], s[1], s[2]]),
    tz: "UTC+5",
    trackingSince: allDays[0] || null
  };
}

function okKey(q) {
  const key = process.env.STATS_KEY || "";
  if (!key || typeof q !== "string") return false;
  const a = crypto.createHash("sha256").update(q).digest();
  const b = crypto.createHash("sha256").update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

const PAGE = String.raw`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TamoLove — мониторинг</title>
<style>
:root{--bg:#fff7fa;--card:#fff;--ink:#3b2230;--mut:#8a6b7a;--line:#f0dbe3;--a:#e0577f;--b:#6fa8ff;--c:#7ed08a;--d:#f5b84a}
@media (prefers-color-scheme:dark){:root{--bg:#1d1419;--card:#2a1d24;--ink:#f6e8ee;--mut:#b99aa8;--line:#44313b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,sans-serif;padding:14px 16px 40px;max-width:980px;margin-inline:auto}
h1{font-size:20px;margin:6px 0 2px}.sub{color:var(--mut);font-size:13px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:700px){.grid{grid-template-columns:repeat(4,1fr)}}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.k{font-size:12px;color:var(--mut)}.v{font-size:28px;font-weight:700;margin-top:2px}.v small{font-size:13px;font-weight:400;color:var(--mut)}
.live{color:var(--c)}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c);margin-right:6px;animation:p 1.6s infinite}
@keyframes p{50%{opacity:.3}}
h2{font-size:15px;margin:22px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.tabs button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:4px 10px;font-size:12px;margin-left:4px}
.tabs button.on{background:var(--a);color:#fff;border-color:var(--a)}
canvas{width:100%;height:200px;display:block}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:6px 4px;border-bottom:1px solid var(--line);text-align:right}th:first-child,td:first-child{text-align:left}th{color:var(--mut);font-weight:500}
.leg{font-size:12px;color:var(--mut);margin-top:6px}.leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 4px 0 10px}.leg i:first-child{margin-left:0}
#err{color:#d33;padding:20px;text-align:center}
</style></head><body>
<h1>🏡 TamoLove — мониторинг</h1><div class="sub" id="upd">Загрузка…</div><div id="err"></div>
<div class="grid" id="top"></div>
<h2>Онлайн <span class="tabs" id="t1"><button data-v="24">24 часа</button><button data-v="168">7 дней</button></span></h2>
<div class="card"><canvas id="c1"></canvas><div class="leg"><i style="background:var(--a)"></i>игроков онлайн (пик за час)<i style="background:var(--b)"></i>гостей</div></div>
<h2>Заходы по дням <span class="tabs" id="t2"><button data-v="14">14 дн.</button><button data-v="30">30 дн.</button><button data-v="60">60 дн.</button></span></h2>
<div class="card"><canvas id="c2"></canvas><div class="leg"><i style="background:var(--a)"></i>уникальных игроков<i style="background:var(--c)"></i>из них новых</div></div>
<h2>По месяцам</h2>
<div class="card"><canvas id="c3"></canvas><div class="leg"><i style="background:var(--a)"></i>уникальных игроков<i style="background:var(--c)"></i>новых</div></div>
<div class="card" style="margin-top:10px"><table id="tb"></table></div>
<h2>Дома</h2>
<div class="grid" id="bt"></div>
<div class="sub" style="margin-top:16px" id="foot"></div>
<script>
const KEY=new URLSearchParams(location.search).get("key")||"";
let D=null,p1=24,p2=30;
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function setup(cv){const r=devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;cv.width=w*r;cv.height=h*r;const g=cv.getContext("2d");g.setTransform(r,0,0,r,0,0);g.clearRect(0,0,w,h);return{g,w,h}}
function nice(m){return Math.max(4,Math.ceil(m/4)*4)}
function axes(g,w,h,max,L,B){g.font="11px system-ui";g.fillStyle=css("--mut");g.strokeStyle=css("--line");g.lineWidth=1;for(let i=0;i<=4;i++){const y=h-B-(h-B-8)*i/4;g.beginPath();g.moveTo(L,y);g.lineTo(w,y);g.stroke();g.textAlign="right";g.fillText(Math.round(max*i/4),L-4,y+4)}}
function bars(cv,labels,series,colors,every){const{g,w,h}=setup(cv),L=30,B=22;const max=nice(Math.max(1,...series.flat()));axes(g,w,h,max,L,B);const n=labels.length,bw=(w-L)/n;
 g.textAlign="center";g.fillStyle=css("--mut");labels.forEach((t,i)=>{if(i%every===0)g.fillText(t,L+bw*(i+.5),h-6)});
 series.forEach((s,si)=>{g.fillStyle=colors[si];const k=series.length,iw=Math.max(2,Math.min(bw*.8/k,22));s.forEach((v,i)=>{const bh=(h-B-8)*v/max,x=L+bw*(i+.5)-iw*k/2+si*iw;g.beginPath();if(g.roundRect)g.roundRect(x,h-B-bh,iw-1,bh,2);else g.rect(x,h-B-bh,iw-1,bh);g.fill()})})}
function lines(cv,labels,series,colors,every){const{g,w,h}=setup(cv),L=30,B=22;const max=nice(Math.max(1,...series.flat()));axes(g,w,h,max,L,B);const n=labels.length,st=(w-L-6)/Math.max(1,n-1);
 g.textAlign="center";g.fillStyle=css("--mut");labels.forEach((t,i)=>{if(i%every===0)g.fillText(t,L+st*i,h-6)});
 series.forEach((s,si)=>{g.strokeStyle=colors[si];g.lineWidth=2;g.beginPath();s.forEach((v,i)=>{const x=L+st*i,y=h-B-(h-B-8)*v/max;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();if(si===0){g.lineTo(L+st*(n-1),h-B);g.lineTo(L,h-B);g.closePath();g.globalAlpha=.12;g.fillStyle=colors[0];g.fill();g.globalAlpha=1}})}
function card(k,v,s){return '<div class="card"><div class="k">'+k+'</div><div class="v">'+v+(s?' <small>'+s+'</small>':'')+'</div></div>'}
const ru=d=>{const[y,m,x]=d.split("-");return x+"."+m};
const MN=["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
function draw(){if(!D)return;
 // онлайн: пик по часам
 const hrs=p1,now=D.now,hh=3600000,start=Math.floor(now/hh)*hh-(hrs-1)*hh;
 const a=Array(hrs).fill(0),b=Array(hrs).fill(0),lb=[];
 for(const s of D.samples){const i=Math.floor((s[0]-start)/hh);if(i>=0&&i<hrs){a[i]=Math.max(a[i],s[1]);b[i]=Math.max(b[i],s[2])}}
 a[hrs-1]=Math.max(a[hrs-1],D.online);b[hrs-1]=Math.max(b[hrs-1],D.guests);
 for(let i=0;i<hrs;i++){const dt=new Date(start+i*hh+5*3600000);lb.push(hrs>24?(dt.getUTCDate()+"."+String(dt.getUTCMonth()+1).padStart(2,"0")):dt.getUTCHours()+":00")}
 lines(c1,lb,[a,b],[css("--a"),css("--b")],hrs>24?24:3);
 const dd=D.daily.slice(-p2);
 bars(c2,dd.map(x=>ru(x.d)),[dd.map(x=>x.users),dd.map(x=>x.new)],[css("--a"),css("--c")],p2>30?9:p2>14?5:2);
 const mm=D.monthly;if(mm.length)bars(c3,mm.map(x=>MN[+x.m.slice(5)-1]+" "+x.m.slice(2,4)),[mm.map(x=>x.users),mm.map(x=>x.new)],[css("--a"),css("--c")],1);
}
function render(){const x=D;
 document.getElementById("upd").textContent="Обновлено: "+new Date(x.now).toLocaleTimeString("ru-RU")+" · время считается по UTC+5 · обновляется само раз в 30 сек";
 document.getElementById("top").innerHTML=
  card('<span class="dot"></span>Онлайн сейчас','<span class="live">'+x.online+'</span>','в '+x.housesOnline+' домах')+
  card("Гостей в чужих домах",x.guests,"")+
  card("Сегодня заходили",x.dau,"пик онлайн "+x.peakToday)+
  card("Новых сегодня",x.newToday,"")+
  card("За неделю",x.wau,"+"+x.newWeek+" новых")+
  card("За 30 дней",x.mau,"+"+x.newMonth+" новых")+
  card("Всего игроков",x.totals.players,"в "+x.totals.houses+" домах")+
  card("Заходов сегодня",x.daily[x.daily.length-1].sessions,"");
 document.getElementById("bt").innerHTML=
  card("Домов с друзьями",x.totals.withFriends,"")+card("Планировка 1",x.totals.plans[0],"")+card("Планировка 2",x.totals.plans[1],"")+card("Планировка 3",x.totals.plans[2],"");
 const rows=x.monthly.slice().reverse().map(m=>"<tr><td>"+MN[+m.m.slice(5)-1]+" "+m.m.slice(0,4)+"</td><td>"+m.users+"</td><td>"+m.new+"</td><td>"+m.sessions+"</td></tr>").join("");
 document.getElementById("tb").innerHTML="<tr><th>Месяц</th><th>Игроков</th><th>Новых</th><th>Заходов</th></tr>"+(rows||"<tr><td colspan=4>Данных пока нет</td></tr>");
 document.getElementById("foot").textContent=x.trackingSince?("Статистика ведётся с "+x.trackingSince+". До этого дня данных нет."):"Статистика только начала собираться.";
 draw();}
async function load(){try{const r=await fetch("/stats.json?key="+encodeURIComponent(KEY),{cache:"no-store"});if(!r.ok)throw new Error(r.status===403?"Неверный ключ":"Ошибка "+r.status);D=await r.json();document.getElementById("err").textContent="";render()}catch(e){document.getElementById("err").textContent=e.message}}
function tabs(id,get,set){const el=document.getElementById(id);const sync=()=>el.querySelectorAll("button").forEach(b=>b.classList.toggle("on",+b.dataset.v===get()));el.onclick=e=>{if(e.target.dataset.v){set(+e.target.dataset.v);sync();draw()}};sync()}
const c1=document.getElementById("c1"),c2=document.getElementById("c2"),c3=document.getElementById("c3");
tabs("t1",()=>p1,v=>p1=v);tabs("t2",()=>p2,v=>p2=v);
addEventListener("resize",draw);load();setInterval(load,30000);
</script></body></html>`;

function setup(app, getCtx) {
  ctx = getCtx;
  app.get("/stats", (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!process.env.STATS_KEY) {
      return res.status(200).type("text/plain; charset=utf-8").send("Мониторинг не включён: в Render добавь переменную STATS_KEY (твой личный пароль) и открой /stats?key=ТВОЙ_ПАРОЛЬ");
    }
    if (!okKey(req.query.key)) return res.status(403).type("text/plain; charset=utf-8").send("Нужен ключ: /stats?key=...");
    res.type("html").send(PAGE);
  });
  app.get("/stats.json", (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!okKey(req.query.key)) return res.status(403).json({ error: "forbidden" });
    res.json(build());
  });
  setInterval(sample, SAMPLE_EVERY);
  setInterval(() => save(), 60000);
}

module.exports = { setup, load, save, seen };
