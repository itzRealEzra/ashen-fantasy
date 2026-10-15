/* Ashen Fantasy — vanilla JS state machine: username -> roots -> main */
const $ = (id) => document.getElementById(id);
const CLIENT_VERSION = "0.6.2"; // must match server.py server_version + footer
const state = {
  username: localStorage.getItem("af_user") || "",
  rollId: null,
  rolled: [],
  picks: new Set(),
  inspecting: null,
  index: [],
  player: JSON.parse(localStorage.getItem("af_player") || "null"),
};

function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function log(el, msg) {
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}
// Single-line event message for the cultivate panel: slides in,
// then fades out after a few seconds.
let eventTimer = null;
function cEvent(msg) {
  const el = $("cult-event");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("show");
  void el.offsetWidth; // restart the entrance animation
  el.classList.add("show");
  if (eventTimer) clearTimeout(eventTimer);
  eventTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
// Breakthrough is only offered once the stage threshold is truly met.
function breakthroughReady(p) {
  const st = stageOf(p);
  return p.cultivation >= st.cost && p.bottleneck >= st.bottleneck_req;
}

// ---------- username ----------
$("username-btn").onclick = () => {
  const v = $("username-input").value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(v)) {
    $("username-err").textContent = "Name must be 3–16 chars: letters, numbers, _";
    return;
  }
  state.username = v;
  localStorage.setItem("af_user", v);
  enterRoots();
};
$("username-input").value = state.username;

// ---------- roots ----------
async function enterRoots() {
  show("screen-roots");
  await loadIndex();
  if (state.player && state.player.username === state.username) return enterMain(state.player);
  doRoll(true);
}

async function loadIndex() {
  try {
    const r = await fetch("/api/roots");
    const j = await r.json();
    state.index = j.roots || [];
    const box = $("root-index");
    box.innerHTML = "";
    const tiers = {};
    state.index.forEach(rt => { (tiers[rt.rarity] = tiers[rt.rarity] || []).push(rt); });
    ["Mortal","Earth","Heaven","Immortal","Divine","Primordial"].forEach(t => {
      if (!tiers[t]) return;
      const h = document.createElement("div");
      h.className = "idx-tier";
      h.innerHTML = `<b style="color:${tiers[t][0].color}">◆ ${t}</b>`;
      box.appendChild(h);
      tiers[t].forEach(rt => {
        const d = document.createElement("div");
        d.className = "idx-row";
        d.innerHTML = `<span style="color:${rt.color}">${esc(rt.name)}</span><span>${rt.chance_pct}%</span>`;
        d.title = rt.element;
        box.appendChild(d);
      });
    });
  } catch { $("root-index").innerHTML = "<p class='muted'>Index failed to load.</p>"; }
}

$("roll-btn").onclick = () => doRoll(false);

async function doRoll(first) {
  const btn = $("roll-btn");
  btn.disabled = true;
  state.picks.clear();
  updatePicked();
  const anim = $("roll-anim");
  anim.classList.add("rolling");
  // animated scramble using index names (or placeholder)
  const names = state.index.length ? state.index.map(r => r.name) : ["Sensing heavenly qi…"];
  let ticks = 0;
  const iv = setInterval(() => {
    const n = names[Math.floor(Math.random() * names.length)];
    anim.innerHTML = `<span class="big-root">☯ ${esc(n)}</span>consulting the heavens…`;
    if (++ticks > 10) clearInterval(iv);
  }, 90);

  try {
    const r = await fetch("/api/roll", { method: "POST", headers: {"Content-Type":"application/json"}, body: "{}" });
    const j = await r.json();
    clearInterval(iv);
    if (j.error) { anim.classList.remove("rolling"); anim.textContent = j.error; btn.disabled = false; return; }
    state.rollId = j.roll_id;
    state.rolled = j.roots;
    // reveal: show rarest first as climax
    anim.classList.remove("rolling");
    const top = [...j.roots].sort((a,b) => (b.qi_mult||0)-(a.qi_mult||0))[0];
    anim.innerHTML = `<span class="big-root" style="color:${top.color}">✦ ${esc(top.name)}</span><span style="color:${top.color}">${esc(top.rarity)} · ${esc(top.element)}</span><br/>Heaven has spoken — 9 roots revealed.`;
    renderRollList();
    if (first) log({}, "");
  } catch {
    clearInterval(iv);
    anim.classList.remove("rolling");
    anim.textContent = "Roll failed — is server.py running?";
  }
  btn.disabled = false;
  btn.textContent = "Roll again";
}

function renderRollList() {
  const list = $("roll-list");
  list.innerHTML = "";
  state.rolled.forEach(rt => {
    const row = document.createElement("div");
    row.className = "roll-row" + (state.picks.has(rt.id) ? " selected" : "");
    row.style.borderLeftColor = rt.color;
    row.innerHTML = `<label><input type="checkbox" ${state.picks.has(rt.id)?"checked":""}/> <b>${esc(rt.name)}</b></label><span class="rar" style="color:${rt.color};border-color:${rt.color}">${esc(rt.rarity)}</span>`;
    row.onclick = (e) => {
      inspect(rt);
      if (e.target.tagName === "INPUT") return; // handled below
      togglePick(rt, row);
    };
    row.querySelector("input").onclick = (e) => { e.stopPropagation(); togglePick(rt, row); };
    list.appendChild(row);
  });
  if (!state.inspecting && state.rolled[0]) inspect(state.rolled[0]);
}

function togglePick(rt, row) {
  if (state.picks.has(rt.id)) state.picks.delete(rt.id);
  else {
    if (state.picks.size >= 3) { inspect(rt); alert("Only 3 roots may form your foundation."); return; }
    state.picks.add(rt.id);
  }
  inspect(rt);
  renderRollList();
  updatePicked();
}

function inspect(rt) {
  state.inspecting = rt;
  $("detail-box").innerHTML = `
    <h4 style="color:${rt.color};margin:0 0 6px">${esc(rt.name)}</h4>
    <div><b>${esc(rt.rarity)}</b> · ${esc(rt.element)} · ${(rt.chance_pct??"") === "" ? "" : rt.chance_pct + "%"}</div>
    <p>${esc(rt.desc)}</p>
    <div class="stat-grid">
      <div>Qi ×${rt.qi_mult}</div><div>Compre: ${rt.comprehension}</div>
      <div>Physique: ${rt.physique}</div><div>Fortune: ${rt.fortune}</div>
    </div>`;
}

function updatePicked() {
  $("picked-count").textContent = state.picks.size;
  const b = $("confirm-btn");
  b.disabled = state.picks.size !== 3;
  b.textContent = `Enter Cultivation (${state.picks.size}/3)`;
}

$("confirm-btn").onclick = async () => {
  const b = $("confirm-btn");
  b.disabled = true;
  try {
    const r = await fetch("/api/create", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ username: state.username, roll_id: state.rollId, picks: [...state.picks] })
    });
    const j = await r.json();
    if (j.error) { alert(j.error); b.disabled = false; return; }
    localStorage.setItem("af_player", JSON.stringify(j.player));
    state.player = j.player;
    enterMain(j.player);
  } catch { alert("Create failed."); b.disabled = false; }
};

// ---------- idle cultivation engine (v0.2.0) ----------
let REALM_TABLE = [];
let tickTimer = null, syncTimer = null, lastTick = 0;
let stageFlags = { half: false, full: false };
const TABID = Math.random().toString(36).slice(2);
const OFFLINE_CAP_SEC = 8 * 3600, OFFLINE_EFF = 0.5;

function fallbackRealms() {
  // Mirrors the server ladder: Mortal (major) + Qi Refinement Realm I-X.
  // Every breakthrough advances straight to the next realm.
  const specs = [{ realm: "Mortal", major: true, bottleneck_req: 0,
    flavor: "A mortal body of flesh and bone. Endure the tribulation and step onto the Dao." }];
  const stages = [
    ["I", 0, "First breath of qi. The dantian stirs."],
    ["II", 0, "Meridians open like spring streams."],
    ["III", 0, "Qi pools steady. The body hardens."],
    ["IV", 0, "Night meditation deepens; senses sharpen."],
    ["V", 0, "Half-step threshold. The heart wavers."],
    ["VI", 1, "Bottleneck looms. Grind insight through circulation."],
    ["VII", 0, "Thunder rumbles far away. Heaven watches."],
    ["VIII", 1, "The dam is about to break. Temper the foundation."],
    ["IX", 1, "One step from the peak. The heavens take notice."],
    ["X", 0, "PEAK of Qi Refinement. Excess qi condenses into Dao Insight."],
  ];
  for (const [numeral, bottleneck_req, flavor] of stages)
    specs.push({ realm: `Qi Refinement Realm ${numeral}`, major: false, bottleneck_req, flavor });
  return specs.map((s, i) => ({
    idx: i, name: s.realm, realm: s.realm, layer: 0,
    cost: Math.round(50 * Math.pow(1.6, i)),
    rate_mult: Math.round((1 + 0.15 * i) * 100) / 100,
    major: s.major, bottleneck_req: s.bottleneck_req, flavor: s.flavor,
    cap: i === specs.length - 1,
  }));
}

async function fetchRealms() {
  try {
    const r = await fetch("/api/realms");
    const j = await r.json();
    if (j.realms && j.realms.length) return j.realms;
  } catch {}
  return fallbackRealms();
}

function stageOf(p) {
  const i = Math.max(0, Math.min(p.realm_idx | 0, REALM_TABLE.length - 1));
  return REALM_TABLE[i];
}

function cultRate(p) {
  const st = stageOf(p);
  return 1.0 * p.stats.qi_mult * st.rate_mult;
}

function normalizePlayer(p) {
  // Keep numeric progress across ladder changes (clamped); else match by name.
  let idx = Number.isFinite(+p.realm_idx) ? Math.floor(+p.realm_idx) : -1;
  if (idx < 0) {
    idx = REALM_TABLE.findIndex(s => s.name === p.realm);
    if (idx < 0) idx = 0;
  }
  p.realm_idx = Math.max(0, Math.min(idx, REALM_TABLE.length - 1));
  const st = stageOf(p);
  p.realm = st.name;
  p.cultivation = Math.max(0, +p.cultivation || 0);
  p.cultivation_to_next = st.cost;
  p.bottleneck = Math.max(0, Math.min(p.bottleneck | 0, st.bottleneck_req));
  p.dao_insight = p.dao_insight | 0;
  p.seclusion = false; // seclusion retired in v0.4.1 (pure idle)
  if (!p.last_seen) p.last_seen = Date.now() / 1000;
  return p;
}

function saveLocal(p) {
  p.last_seen = Date.now() / 1000;
  try { localStorage.setItem("af_player", JSON.stringify(p)); } catch {}
}

function accrue(p, amt, quiet) {
  const st = stageOf(p);
  p.cultivation += amt;
  if (st.cap) {
    while (p.cultivation >= st.cost) {
      p.cultivation -= st.cost;
      p.dao_insight++;
      if (!quiet) cEvent(`✦ Excess qi condenses into Dao Insight (${p.dao_insight}).`);
    }
  } else if (!quiet) {
    const frac = p.cultivation / st.cost;
    if (frac >= 0.5 && !stageFlags.half) {
      stageFlags.half = true;
      cEvent("Your qi churns at half-full. The bottleneck trembles…");
    }
    if (frac >= 1 && !stageFlags.full) {
      stageFlags.full = true;
      cEvent("Qi brims over! Attempt a breakthrough.");
    }
  }
  updateQi(p);
}

function refreshCultPanel() {
  const p = state.player;
  if (!p || !REALM_TABLE.length) return;
  const st = stageOf(p), rate = cultRate(p);
  p.cultivation_to_next = st.cost;
  // Topbar shows the realm only; the art panel shows rate + breakthrough.
  $("p-realm").textContent = st.realm;
  $("cult-rate").textContent = `+${rate.toFixed(1)}/s Qi`;
  $("breakthrough-btn").classList.toggle("show", breakthroughReady(p));
  renderChar(p);
}

async function enterMain(p) {
  REALM_TABLE = await fetchRealms();
  normalizePlayer(p);
  const frac = p.cultivation / stageOf(p).cost;
  stageFlags = { half: frac >= 0.5, full: frac >= 1 };
  show("screen-main");
  $("p-name").textContent = p.username;
  // offline gains: capped at 8h, 50% efficiency
  const nowS = Date.now() / 1000;
  const elapsed = Math.max(0, nowS - (p.last_seen || nowS));
  if (elapsed > 60) {
    const gain = cultRate(p) * Math.min(elapsed, OFFLINE_CAP_SEC) * OFFLINE_EFF;
    accrue(p, gain, true);
    const h = Math.floor(elapsed / 3600), m = Math.floor((elapsed % 3600) / 60);
    cEvent(`Welcome back — ${h}h ${m}m away, +${Math.floor(gain)} Qi gathered in absence.`);
  } else {
    cEvent(`${p.username} steps onto the cultivation path. Realm: ${stageOf(p).realm}.`);
  }
  refreshCultPanel();
  updateQi(p);
  saveLocal(p);
  battle.areas = await fetchAreas();
  loadLoot();
  showBattleAreas();
  startTick();
  syncPlayer(true);
}

function renderChar(p) {
  if (!REALM_TABLE.length) return;
  const st = stageOf(p);
  const d = derivedStats(p);
  $("char-sheet").innerHTML =
    `<p><b>${esc(p.username)}</b> · ${esc(st.realm)}</p>` +
    `<div class="stat-panel">` +
    `<div><span>HP</span><b>${d.hp}</b></div>` +
    `<div><span>Qi</span><b id="char-qi">${Math.floor(p.cultivation)} <small>(+${cultRate(p).toFixed(1)}/s)</small></b></div>` +
    `<div><span>Attack</span><b>${d.atk}</b></div>` +
    `<div><span>Defense</span><b>${d.def}</b></div>` +
    `<div><span>Crit chance</span><b>${d.crit}%</b></div>` +
    `<div><span>Crit dmg</span><b>${d.critDmg}%</b></div>` +
    `</div>` +
    `<p class="muted">💠 Dao Insight ×${p.dao_insight} · ${esc(st.flavor)}</p>` +
    p.roots.map(r => `<div class="char-card" style="border-left-color:${r.color}"><b style="color:${r.color}">${esc(r.name)}</b> <small>${esc(r.rarity)} · ${esc(r.element)}</small><br/>${esc(r.desc)}</div>`).join("");
}

// Combat stats derived from spiritual-root foundation + realm.
// Single source for everything the Character panel shows.
function derivedStats(p) {
  const s = p.stats, r = p.realm_idx | 0;
  return {
    hp: Math.round((100 + s.physique * 25) * (1 + r * 0.1)),
    atk: Math.round(10 + (s.physique * 2 + s.comprehension * 1.5) * (1 + r * 0.08)),
    def: Math.round(5 + s.physique * 1.2 + r * 2),
    crit: Math.min(60, Math.round(5 + s.comprehension * 1.2 + s.fortune * 0.5)),
    critDmg: Math.round(150 + s.fortune * 4 + s.comprehension * 1.5),
  };
}

function updateQi(p) {
  $("p-name").textContent = p.username;
  $("qi-bar").style.width = Math.min(100, p.cultivation / p.cultivation_to_next * 100) + "%";
  // Character panel Qi stays live between full re-renders.
  const cq = $("char-qi");
  if (cq && REALM_TABLE.length)
    cq.innerHTML = `${Math.floor(p.cultivation)} <small>(+${cultRate(p).toFixed(1)}/s)</small>`;
  const bb = $("breakthrough-btn");
  if (bb) bb.classList.toggle("show", REALM_TABLE.length ? breakthroughReady(p) : false);
}

// single-tab tick ownership: background tabs render but do not accrue
function claimTick() {
  try {
    const raw = localStorage.getItem("af_tick_lock");
    const l = raw ? JSON.parse(raw) : null;
    const now = Date.now();
    if (!l || now - l.ts > 3000 || l.tab === TABID) {
      localStorage.setItem("af_tick_lock", JSON.stringify({ tab: TABID, ts: now }));
      return true;
    }
    return false;
  } catch { return true; }
}

function startTick() {
  stopTick();
  lastTick = Date.now();
  tickTimer = setInterval(() => {
    const p = state.player;
    if (!p || !REALM_TABLE.length) return;
    if (!claimTick()) return;
    const now = Date.now();
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    if (dt <= 0) return;
    if (dt > 3600) dt = 3600;
    // background-throttled time accrues at offline efficiency, mirroring /api/sync
    const rate = cultRate(p);
    const gain = dt <= 300 ? rate * dt : rate * 300 + rate * (dt - 300) * OFFLINE_EFF;
    accrue(p, gain);
    saveLocal(p);
  }, 1000);
  syncTimer = setInterval(() => syncPlayer(false), 30000);
}

function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  if (syncTimer) clearInterval(syncTimer);
  tickTimer = syncTimer = null;
}

let syncing = false;
async function syncPlayer(initial) {
  const p = state.player;
  if (!p || syncing) return;
  syncing = true;
  try {
    const r = await fetch("/api/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: p.username, cultivation: p.cultivation, realm_idx: p.realm_idx,
        bottleneck: p.bottleneck, dao_insight: p.dao_insight, seclusion: p.seclusion,
      }),
    });
    const j = await r.json();
    if (j.ok && j.player) {
      const wasRealm = p.realm_idx;
      Object.assign(p, j.player);
      if (p.realm_idx !== wasRealm) {
        stageFlags = { half: true, full: true };
        $("p-realm").textContent = stageOf(p).realm;
      }
      if (j.clamped && !initial)
        cEvent("Heaven corrects your meridians — reported qi exceeded honest gains. (clamped)");
      renderChar(p);
      refreshCultPanel();
      updateQi(p);
      saveLocal(p);
    }
  } catch {
    if (initial) cEvent("Heaven is silent (server unreachable) — cultivating locally.");
  }
  syncing = false;
}

document.addEventListener("visibilitychange", () => {
  if (!state.player) return;
  if (document.hidden) {
    saveLocal(state.player);
    syncPlayer(false);
  } else {
    lastTick = Date.now();
  }
});

$("breakthrough-btn").onclick = () => {
  const p = state.player;
  if (!p) return;
  const st = stageOf(p);
  if (st.cap) {
    if (p.cultivation < st.cost) {
      cEvent(`Peak unmoved. Need ${st.cost - Math.floor(p.cultivation)} more qi to condense insight.`);
      return;
    }
    p.cultivation -= st.cost;
    p.dao_insight++;
    cEvent(`💠 A full bar of peak-stage qi collapses into Dao Insight (${p.dao_insight}). The heavens take note.`);
    saveLocal(p);
    refreshCultPanel();
    updateQi(p);
    syncPlayer(false);
    return;
  }
  if (p.cultivation < p.cultivation_to_next) {
    cEvent(`Bottleneck holds. Need ${p.cultivation_to_next - Math.floor(p.cultivation)} more qi. Fortune ${p.stats.fortune} watches.`);
    return;
  }
  // bottleneck grinding: insight attempts cost 25% qi each
  if (p.bottleneck < st.bottleneck_req) {
    p.bottleneck++;
    p.cultivation = Math.floor(p.cultivation * 0.75);
    cEvent(p.bottleneck >= st.bottleneck_req
      ? `💥 Bottleneck shattered! Insight ${p.bottleneck}/${st.bottleneck_req} — attempt the breakthrough again!`
      : `Grinding the bottleneck… insight ${p.bottleneck}/${st.bottleneck_req} (−25% qi dispersed). Circulate and try again.`);
    saveLocal(p);
    refreshCultPanel();
    updateQi(p);
    return;
  }
  // major realm: tribulation — face 3 calamities, endure at least 2
  if (st.major) {
    const trials = [
      ["Heavenly thunder", p.stats.fortune],
      ["Heart demon", p.stats.comprehension],
      ["Body tempering", p.stats.physique],
    ];
    let endured = 0;
    const trialNotes = [];
    for (const [nm, stat] of trials) {
      const roll = Math.random() * 10 + stat * 0.12;
      if (roll > 6.5) {
        endured++;
        trialNotes.push(`✓ ${nm}`);
      } else trialNotes.push(`✗ ${nm}`);
    }
    cEvent(`Tribulation: ${trialNotes.join(" · ")} (${endured}/3 endured).`);
    if (endured >= 2) {
      advanceRealm(p, `⚡ Tribulation passed (${endured}/3)! Realm rises. Heavenly thunder bows.`);
    } else {
      const loss = 0.25 + Math.random() * 0.25;
      p.cultivation = Math.floor(p.cultivation * (1 - loss));
      cEvent(`☠ Tribulation failed (${endured}/3) — ${Math.round(loss * 100)}% of qi disperses. Your insight remains; temper yourself and return.`);
      saveLocal(p);
      refreshCultPanel();
      updateQi(p);
    }
    return;
  }
  const luck = Math.random() * 10 + p.stats.fortune * 0.4;
  if (luck > 7) {
    advanceRealm(p, "⚡ Breakthrough! The bottleneck dissolves like mist.");
  } else {
    p.cultivation = Math.floor(p.cultivation * 0.5);
    cEvent("☠ Breakthrough failed — qi deviates! Half your qi disperses. Circulate qi and try again.");
    saveLocal(p);
    refreshCultPanel();
    updateQi(p);
  }
};

function advanceRealm(p, msg) {
  // Consume only the old stage cost — surplus Qi carries into the new stage.
  const cost = stageOf(p).cost;
  p.cultivation = Math.max(0, p.cultivation - cost);
  p.realm_idx = Math.min(p.realm_idx + 1, REALM_TABLE.length - 1);
  const st = stageOf(p);
  p.realm = st.name;
  p.cultivation_to_next = st.cost;
  p.bottleneck = 0;
  stageFlags = { half: false, full: false };
  $("p-realm").textContent = st.realm;
  cEvent(`${msg} Realm rises: ${p.realm}. ${st.flavor}`);
  saveLocal(p);
  renderChar(p);
  refreshCultPanel();
  updateQi(p);
  syncPlayer(false);
}

document.querySelectorAll(".side-btn").forEach(b => b.onclick = () => {
  if (b.dataset.tab !== "battle") stopBattle();
  document.querySelectorAll(".side-btn").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $("tab-" + b.dataset.tab).classList.add("active");
  // sidebar auto-hides on every panel switch
  $("sidebar").classList.remove("open");
  $("hamburger").classList.add("collapsed");
});
$("hamburger").onclick = () => {
  const sb = $("sidebar");
  sb.classList.toggle("open");
  $("hamburger").classList.toggle("collapsed", !sb.classList.contains("open"));
};

// ---------- battle engine (v0.6.0): areas -> enemies -> auto combat ----------
const battle = {
  areas: [], view: "areas", area: null, mob: null,
  php: 1, ehp: 1, pbar: 0, ebar: 0, timer: null,
  searching: false, kills: 0, loot: {},
};

function lootKey() { return "af_loot_" + (state.username || "guest"); }
function loadLoot() {
  try { battle.loot = JSON.parse(localStorage.getItem(lootKey()) || "{}"); }
  catch { battle.loot = {}; }
}
function saveLoot() {
  try { localStorage.setItem(lootKey(), JSON.stringify(battle.loot)); } catch {}
}

async function fetchAreas() {
  try {
    const r = await fetch("/api/areas");
    const j = await r.json();
    if (j.areas && j.areas.length) return j.areas;
  } catch {}
  return [];
}

function stopBattle() {
  if (battle.timer) clearInterval(battle.timer);
  battle.timer = null;
  battle.searching = false;
}

function playerMaxHp(p) { return derivedStats(p).hp; }

function showBattleAreas() {
  battle.view = "areas";
  stopBattle();
  const p = state.player;
  const root = $("battle-root");
  root.innerHTML = "<h2>Choose hunting grounds</h2>" + battle.areas.map(a => {
    const locked = (p.realm_idx | 0) < a.req_idx;
    return `<div class="area-row${locked ? " locked" : ""}" data-area="${a.id}">
      <div class="area-left"><b>${esc(a.name)}</b><p class="muted">${esc(a.desc)}</p></div>
      <div class="area-right">Realm need<br/><b>${esc(a.req)}</b><br/>${esc(a.difficulty)}</div>
    </div>`;
  }).join("") || `<p class="muted">No hunting grounds known. Is server.py running?</p>`;
  root.querySelectorAll(".area-row:not(.locked)").forEach(el => el.onclick = () => {
    battle.area = battle.areas.find(x => x.id === el.dataset.area);
    showBattleEnemies("");
  });
}

function showBattleEnemies(notice) {
  battle.view = "enemies";
  stopBattle();
  const a = battle.area;
  const root = $("battle-root");
  root.innerHTML =
    `<div class="enemy-head"><h2>${esc(a.name)}</h2><button id="enemy-back" class="btn">Back</button></div>` +
    `<p class="enemy-notice">${esc(notice || "")}</p>` +
    `<div class="enemy-grid">` + a.mobs.map(m =>
      `<div class="enemy-card" data-mob="${m.id}">
        <b>${esc(m.name)}</b>
        <div class="realm-tag">${esc(m.realm)}</div>
        <div class="desc">${esc(m.desc)}</div>
        <div class="enemy-glyph">${esc(m.glyph)}</div>
        <div class="enemy-loot">Loot list${m.loot.map(l =>
          `<div><span>${esc(l.item)}</span><span>${Math.round(l.chance * 100)}%</span></div>`).join("")}</div>
      </div>`).join("") + `</div>`;
  $("enemy-back").onclick = showBattleAreas;
  root.querySelectorAll(".enemy-card").forEach(el => el.onclick = () => {
    battle.mob = a.mobs.find(x => x.id === el.dataset.mob);
    startCombat();
  });
}

function startCombat() {
  const p = state.player, m = battle.mob;
  battle.view = "combat";
  battle.php = playerMaxHp(p);
  battle.ehp = m.hp;
  battle.pbar = 0;
  battle.ebar = 0;
  battle.kills = 0;
  battle.searching = false;
  renderCombat();
  stopBattle();
  battle.timer = setInterval(battleTick, 100);
}

function renderCombat() {
  const m = battle.mob, a = battle.area;
  const root = $("battle-root");
  root.innerHTML =
    `<div class="combat-head"><h2>${esc(a.name)} — ${esc(m.name)}</h2><button id="combat-leave" class="btn">Leave</button></div>` +
    `<div class="combat-grid">
      <div class="combat-side" id="side-player"><img src="/assets/character/character_0_meditating.png" alt="You" /></div>
      <div class="vs-badge">VS</div>
      <div class="combat-side" id="side-enemy"><span class="big-glyph">${esc(m.glyph)}</span></div>
    </div>` +
    `<div class="hp-row">
      <div><div class="hp-label"><span>You · HP</span><span id="php-num"></span></div>
        <div class="hp-bar"><div id="php-fill" class="hp-fill"></div></div>
        <div class="hp-label"><span>Attack</span></div>
        <div class="atk-bar"><div id="pbar-fill" class="atk-fill"></div></div></div>
      <div><div class="hp-label"><span>${esc(m.name)} · HP</span><span id="ehp-num"></span></div>
        <div class="hp-bar"><div id="ehp-fill" class="hp-fill"></div></div>
        <div class="hp-label"><span>Attack</span></div>
        <div class="atk-bar"><div id="ebar-fill" class="atk-fill"></div></div></div>
    </div>` +
    `<div id="battle-status"></div>` +
    `<div class="loot-log"><h3>Loot log</h3><div class="loot-rows" id="loot-rows"></div>` +
    `<div class="kill-count" id="kill-count"></div></div>`;
  $("combat-leave").onclick = () => showBattleEnemies("");
  paintCombat();
}

function setBar(id, frac, attack) {
  const el = $(id);
  if (!el) return;
  el.style.width = Math.min(100, Math.max(0, frac * 100)) + "%";
  if (attack) el.classList.toggle("full", frac >= 1);
}

function paintBars() {
  const p = state.player, m = battle.mob;
  if (!p || !m) return;
  setBar("php-fill", battle.php / playerMaxHp(p));
  setBar("ehp-fill", battle.ehp / m.hp);
  const pn = $("php-num"), en = $("ehp-num");
  if (pn) pn.textContent = `${Math.max(0, Math.ceil(battle.php))} / ${playerMaxHp(p)}`;
  if (en) en.textContent = `${Math.max(0, Math.ceil(battle.ehp))} / ${m.hp}`;
  setBar("pbar-fill", battle.pbar, true);
  setBar("ebar-fill", battle.ebar, true);
}

function paintCombat() {
  paintBars();
  const m = battle.mob;
  const lr = $("loot-rows");
  if (lr) lr.innerHTML = Object.keys(battle.loot).sort().map(k =>
    `<div><span>${esc(k)}</span><span>${battle.loot[k]}x</span></div>`).join("") ||
    `<div><span class="muted">No loot yet — slay something.</span><span></span></div>`;
  const kc = $("kill-count");
  if (kc) kc.textContent = battle.kills ? `${m.name} slain ×${battle.kills}` : "";
  const st = $("battle-status");
  if (st) st.innerHTML = battle.searching ? `<div class="searching">Searching for that same enemy…</div>` : "";
}

function flash(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("hit");
  void el.offsetWidth;
  el.classList.add("hit");
}

function strikeDmg(atk, crit, critDmg, dfn) {
  let dmg = Math.max(1, atk * (0.9 + Math.random() * 0.2) - dfn * 0.5);
  const isCrit = Math.random() * 100 < crit;
  if (isCrit) dmg *= critDmg / 100;
  return { dmg: Math.round(dmg), isCrit };
}

function battleTick() {
  const p = state.player, m = battle.mob;
  if (!p || !m || battle.view !== "combat" || battle.searching) return;
  battle.pbar += 0.1 / 1.0; // base attack: 1 second to fill the bar
  battle.ebar += 0.1 / m.speed;
  if (battle.pbar >= 1) {
    battle.pbar = 0;
    const d = derivedStats(p);
    const s = strikeDmg(d.atk, d.crit, d.critDmg, m.def);
    battle.ehp -= s.dmg;
    flash("side-enemy");
  }
  if (battle.ebar >= 1 && battle.ehp > 0) {
    battle.ebar = 0;
    const d = derivedStats(p);
    const s = strikeDmg(m.atk, m.crit, m.crit_dmg, d.def);
    battle.php -= s.dmg;
    flash("side-player");
  }
  if (battle.ehp <= 0) return onMobDeath();
  if (battle.php <= 0) return onPlayerDeath();
  paintBars();
}

function onMobDeath() {
  const p = state.player, m = battle.mob;
  battle.kills++;
  for (const l of m.loot) {
    if (Math.random() < l.chance) {
      const n = l.min + Math.floor(Math.random() * (l.max - l.min + 1));
      battle.loot[l.item] = (battle.loot[l.item] || 0) + n;
    }
  }
  saveLoot();
  accrue(p, m.qi);
  saveLocal(p);
  updateQi(p);
  battle.searching = true;
  battle.pbar = 0;
  battle.ebar = 0;
  paintCombat();
  setTimeout(() => {
    if (battle.view !== "combat") return;
    battle.ehp = m.hp;
    battle.searching = false;
    paintCombat();
  }, 2000);
}

function onPlayerDeath() {
  stopBattle();
  showBattleEnemies(`You were defeated by ${battle.mob.name} — dragged out of the hunt. Heal up and return.`);
}

// boot
if (state.username) $("username-input").value = state.username;
checkServerFresh();

// Warn plainly (not just console 404s) when the server is unreachable or
// older than this client — e.g. a stale server.py left running after a pull.
function serverAlert(msg) {
  let el = $("server-alert");
  if (!el) {
    el = document.createElement("div");
    el.id = "server-alert";
    document.body.prepend(el);
  }
  el.textContent = msg;
  el.style.display = "block";
}

async function checkServerFresh() {
  try {
    const r = await fetch("/api/health");
    const j = await r.json();
    if (!String(j.version || "").endsWith(CLIENT_VERSION)) {
      serverAlert(`Server/client version mismatch (server: ${j.version || "unknown"}, client: v${CLIENT_VERSION}). Restart server.py from the latest pull.`);
    }
  } catch {
    serverAlert("Cannot reach the game server. Start it with: python server.py");
  }
}
