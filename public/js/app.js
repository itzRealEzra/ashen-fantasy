/* Ashen Fantasy — vanilla JS state machine: username -> roots -> main */
const $ = (id) => document.getElementById(id);
const CLIENT_VERSION = "0.9.33"; // must match server.py server_version + footer
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

// ---------- the gate ----------
// The world is loaded before the game opens. The player never sees a
// half-drawn game, and the first click never waits for a table to arrive:
// the fonts, the realms, the items, the grounds and the pictures are all
// in hand by the time the screen is theirs.
let worldReady = false;

function bootStep(pct, text) {
  const fill = $("boot-fill");
  if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  const step = $("boot-step");
  if (step && text) step.textContent = text;
}

function openTheGate() {
  const gate = $("boot-screen");
  if (!gate) return;
  gate.classList.add("gone");
  setTimeout(() => { if (gate.parentNode) gate.parentNode.removeChild(gate); }, 600);
}

// The brush face must be in hand before the labels are drawn, or the first
// paint is a flash of the fallback face.
async function fontsReady() {
  if (!document.fonts || !document.fonts.ready) return;
  try {
    await document.fonts.load('16px "Ma Shan Zheng"');
    await document.fonts.ready;
  } catch {}
}

// Every picture the game can draw, warmed into the browser's cache so no
// panel ever waits for an image.
function artUrls() {
  const urls = new Set();
  for (const it of Object.values(ITEM_BY_ID || {})) if (it.img) urls.add(it.img);
  for (const a of (battle.areas || [])) {
    for (const m of (a.mobs || [])) if (m.img) urls.add(m.img);
  }
  for (const u of Object.values(ICON || {})) {
    if (typeof u === "string" && u.startsWith("/assets/")) urls.add(u);
  }
  return [...urls];
}

function warmArt(urls) {
  if (!urls.length) return Promise.resolve();
  return Promise.all(urls.map(u => new Promise(res => {
    const im = new Image();
    im.onload = () => res();
    im.onerror = () => res();
    im.src = u;
  })));
}

// Load the world. The gate closes when it is done -- or when it has taken
// long enough, because a slow line must not keep the player outside.
async function preloadWorld() {
  const started = Date.now();
  try {
    bootStep(8, "Waking the world…");
    await fontsReady();
    bootStep(20, "Reading the tables…");
    const [realms] = await Promise.all([
      fetchRealms().then(r => { REALM_TABLE = r; return r; }),
      fetchItems(),
      fetchIcons(),
      fetchMasteryDefs(),
    ]);
    bootStep(45, "Finding the hunting grounds…");
    battle.areas = await fetchAreas();
    await fetchSkills();
    bootStep(60, "Waking the plants…");
    // The pictures are warmed, but the gate never waits forever for them.
    await Promise.race([
      warmArt(artUrls()),
      new Promise(res => setTimeout(res, 6000)),
    ]);
    bootStep(100, "The world is ready.");
    worldReady = true;
  } catch {
    worldReady = true;
  }
  openTheGate();
  return Date.now() - started;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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
  // Qi alone gates the button: the bottleneck grind IS this button
  // (clicking at full qi spends 25% per insight), so also gating on
  // bottleneck would hide the only way to ever satisfy it.
  return p.cultivation >= st.cost;
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
  if (state.player && state.player.username === state.username) return enterMain(state.player);
  // Local save missing (new device / cleared storage): restore the server's
  // copy instead of forcing a fresh roll that could overwrite it.
  const remote = await fetchServerPlayer(state.username);
  if (remote) {
    state.player = remote;
    return enterMain(remote);
  }
  await loadIndex();
  doRoll(true);
}

async function fetchServerPlayer(username) {
  try {
    const r = await fetch("/api/player?username=" + encodeURIComponent(username));
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.player && j.player.username ? j.player : null;
  } catch { return null; }
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
    state.inspecting = null; // re-roll replaces the offer — re-inspect fresh
    // reveal: show rarest first as climax
    anim.classList.remove("rolling");
    const top = [...j.roots].sort((a,b) => (b.qi_mult||0)-(a.qi_mult||0))[0];
    anim.innerHTML = `<span class="big-root" style="color:${top.color}">✦ ${esc(top.name)}</span><span style="color:${top.color}">${esc(top.rarity)} · ${esc(top.element)}</span><br/>Heaven has spoken — 9 roots revealed.`;
    renderRollList();
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
let tickTimer = null, syncTimer = null, serverStateTimer = null, lastTick = 0;
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
  const gear = gearBonus(p);
  return 1.0 * p.stats.qi_mult * st.rate_mult
    * Math.max(0, 1 + gear.qi_rate_pct / 100);
}

// The stats a set of roots grants. One place, so a fresh build and a
// re-apply always agree. Every stat does something: qi_mult is the
// cultivation speed, comprehension and physique and fortune feed the combat
// numbers, and synergy_bonus is the reward for two roots of one element.
function rootStats(roots) {
  if (!roots || !roots.length)
    return { qi_mult: 1, comprehension: 0, physique: 0, fortune: 0, synergy_bonus: 0 };
  const avgQi = Math.round(roots.reduce((a, r) => a + (+r.qi_mult || 1), 0) / roots.length * 100) / 100;
  const elems = roots.map(r => r.element);
  const bonus = new Set(elems).size < elems.length ? 0.2 : 0;
  return {
    qi_mult: Math.round((avgQi + bonus) * 100) / 100,
    comprehension: roots.reduce((a, r) => a + (+r.comprehension || 0), 0),
    physique: roots.reduce((a, r) => a + (+r.physique || 0), 0),
    fortune: roots.reduce((a, r) => a + (+r.fortune || 0), 0),
    synergy_bonus: bonus,
  };
}

function normalizePlayer(p) {
  // restore-safe defaults: a server copy can arrive missing fields
  if (!p.stats || typeof p.stats !== "object" || !p.stats.qi_mult)
    p.stats = rootStats(p.roots);
  if (!Array.isArray(p.roots)) p.roots = [];
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
  p.spirit_stones = Math.max(0, Math.floor(+p.spirit_stones || 0));
  if (!p.mastery || typeof p.mastery !== "object") p.mastery = {};
  for (const t of MASTERY_TRACKS) {
    const raw = p.mastery[t];
    // A track the server sent whole (xp, level, rank) keeps its shape; a
    // plain XP figure stays a plain figure.
    if (raw && typeof raw === "object") p.mastery[t] = { ...raw, xp: Math.max(0, raw.xp | 0) };
    else p.mastery[t] = Math.max(0, raw | 0);
  }
  if (!Array.isArray(p.skills)) p.skills = [];
  p.skills = p.skills.filter(id => typeof id === "string").slice(0, 3);
  while (p.skills.length < 3) p.skills.push(null);
  p.seclusion = false; // seclusion retired in v0.4.1 (pure idle)
  if (!p.equipment || typeof p.equipment !== "object") p.equipment = {};
  for (const s of EQUIP_SLOT_LIST) if (!(s in p.equipment)) p.equipment[s] = null;
  for (const s of Object.keys(p.equipment)) {
    if (p.equipment[s] && !ITEM_BY_ID[p.equipment[s]]) p.equipment[s] = null;
  }
  if (!p.inventory || typeof p.inventory !== "object") p.inventory = {};
  for (const k of Object.keys(p.inventory)) {
    if (!ITEM_BY_ID[k] || !(p.inventory[k] > 0)) delete p.inventory[k];
  }
  // Re-home gear sitting in the wrong doll slot (legacy/corrupt saves):
  // move it to its real slot when free, else return it to the bag.
  for (const s of EQUIP_SLOT_LIST) {
    const id = p.equipment[s];
    if (!id || !ITEM_BY_ID[id]) continue;
    const targets = equipTargets(ITEM_BY_ID[id]);
    if (targets.indexOf(s) >= 0) continue;
    p.equipment[s] = null;
    const home = targets.find(t => !p.equipment[t]);
    if (home) p.equipment[home] = id;
    else p.inventory[id] = (p.inventory[id] || 0) + 1;
  }
  if (!Array.isArray(p.elixirs)) p.elixirs = [];
  // One slot per pill type: dedup first (heals legacy 4-slot saves),
  // then re-place into the named slots so the labels stay true.
  const seenElixir = new Set();
  const loadedPills = p.elixirs.filter(x => {
    if (!x || !ITEM_BY_ID[x] || ITEM_BY_ID[x].kind !== "consumable" || seenElixir.has(x)) return false;
    seenElixir.add(x);
    return true;
  });
  p.elixirs = [null, null, null];
  for (const id of loadedPills) {
    const pref = elixirPreferredSlot(ITEM_BY_ID[id]);
    let i = pref >= 0 && !p.elixirs[pref] ? pref : p.elixirs.findIndex(x => !x);
    if (i < 0) continue;
    p.elixirs[i] = id;
  }
  clampHp(p);
  if (!p.last_seen) p.last_seen = Date.now() / 1000;
  return p;
}

function saveLocal(p) {
  p.last_seen = Date.now() / 1000;
  try { localStorage.setItem("af_player", JSON.stringify(p)); } catch {}
}

function addInv(id, n) {
  const p = state.player;
  p.inventory[id] = Math.min(9999, (p.inventory[id] || 0) + n);
}

function takeInv(id, n) {
  const p = state.player;
  p.inventory[id] = Math.max(0, (p.inventory[id] || 0) - n);
  if (!p.inventory[id]) delete p.inventory[id];
}

function clampHp(p) {
  const m = playerMaxHp(p);
  if (!(p.hp > 0)) p.hp = m;
  else p.hp = Math.min(p.hp, m);
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
  // The world was loaded before the game opened, so these are already in
  // hand; they are only fetched again if the gate was skipped.
  if (!REALM_TABLE.length) REALM_TABLE = await fetchRealms();
  if (!Object.keys(ITEM_BY_ID).length) await fetchItems();
  if (!Object.keys(ICON).length) await fetchIcons();
  if (!SKILLS_LOADED) fetchSkills();   // a slow server must not hold the game up
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
  battle.areas = battle.areas.length ? battle.areas : await fetchAreas();
  // The rank tables come first: the character panel draws its masteries
  // from them, and they must be in hand before the panel is painted.
  if (!Object.keys(MASTERY_DEFS).length) await fetchMasteryDefs();
  loadLoot();
  showBattleAreas();
  renderInventory();
  renderChar(p);
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
    `<div><span>HP</span><b id="char-hp">${Math.ceil(p.hp > 0 ? p.hp : d.hp)} / ${d.hp}</b></div>` +
    `<div><span>Qi</span><b id="char-qi">${Math.floor(p.cultivation)} <small>(+${cultRate(p).toFixed(1)}/s)</small></b></div>` +
    `<div><span>Attack</span><b>${d.atk}</b></div>` +
    `<div><span>Defense</span><b>${d.def}</b></div>` +
    `<div><span>Crit chance</span><b>${d.crit}%</b></div>` +
    `<div><span>Crit dmg</span><b>${d.critDmg}%</b></div>` +
    `<div><span>Qi Rate Bonus</span><b>${d.qi_rate_pct}%</b></div>` +
    `<div><span>Agility</span><b>${d.agility}%</b></div>` +
    `<div><span>Luck</span><b>${d.luck}%</b></div>` +
    `<div><span>Spirit</span><b>${d.spirit}</b></div>` +
    `<div><span>Evasion</span><b>${d.evasion}%</b></div>` +
    `<div><span>Energy</span><b>${d.energy}</b></div>` +
    `<div><span>Cooldown Reduction</span><b>${d.cdr}%</b></div>` +
    `</div>` +
    `<p class="muted">💠 Dao Insight ×${p.dao_insight} · ${esc(st.flavor)}</p>` +
    (p.stats.synergy_bonus
      ? `<p class="muted">✦ Synergy · two roots of one element · +${Math.round(p.stats.synergy_bonus * 100)}% HP, Attack, Defense</p>`
      : "") +
    masteryPanel(p) +
    p.roots.map(r => `<div class="char-card" style="border-left-color:${r.color}"><b style="color:${r.color}">${esc(r.name)}</b> <small>${esc(r.rarity)} · ${esc(r.element)}</small><br/>${esc(r.desc)}</div>`).join("");
}

// The four mastery tracks, on the character panel: rank, level, the road to
// the next level and what that level buys.
function masteryRows(p) {
  const m = (p && p.mastery) || {};
  return MASTERY_TRACKS.map(t => {
    const raw = m[t];
    // The local track is a plain XP figure; the server sends the whole track.
    const track = raw && typeof raw === "object" ? raw : null;
    const xp = Math.max(0, track ? (track.xp | 0) : (raw | 0));
    // Every track is a rank of ten levels, so every track reads the same way.
    const lvl = Math.max(1, track && track.level ? track.level : masteryLevel(xp));
    const rank = track && track.rank ? track.rank : 1;
    const within = track && track.within ? track.within : ((lvl - 1) % 10) + 1;
    // The rank's name, and the level inside it -- the numeral is added once.
    const name = (track && track.rank_name) || masteryRankLabel(t, lvl);
    const base = masteryTotalXp(lvl);
    const need = Math.max(1, masteryTotalXp(lvl + 1) - base);
    const into = Math.max(0, xp - base);
    const pct = Math.max(0, Math.min(100, into / need * 100));
    return `<div class="mastery-row">
      <div class="mastery-top"><b>${esc(name)} ${esc(MASTERY_NUMERALS[Math.min(9, within - 1)])}</b><span class="muted">${within}/10</span></div>
      <div class="mastery-bar"><div class="mastery-fill" style="width:${pct}%"></div></div>
      <div class="mastery-xp muted">${into} / ${need} XP</div>
      <div class="mastery-bonus muted">${esc(masteryBonusText(t, lvl))}</div>
    </div>`;
  }).join("");
}

function masteryPanel(p) {
  return `<h3 class="mastery-title">Mastery</h3><div class="mastery-list" id="mastery-list">${masteryRows(p)}</div>`;
}

// The masteries move while the player is doing something else -- gathering
// teaches the herbalist track every few seconds. The bars must follow
// without waiting for a reload, so the rows are repainted in place.
function refreshMasteryPanel() {
  const p = state.player;
  const host = $("mastery-list");
  if (!host || !p) return;
  host.innerHTML = masteryRows(p);
}

// Combat stats derived from spiritual-root foundation + realm + gear.
// Single source for everything the Character panel shows.
function derivedStats(p) {
  const s = p.stats, r = p.realm_idx | 0;
  const g = gearBonus(p);
  // Battle mastery hardens the body: every level past the first adds a
  // percent to the flesh, the swing and the guard. Gear stays flat on top.
  const b = 1 + masteryBodyBonus("battle", masteryXp("battle", p));
  // Synergy: two roots of one element make the whole body worth more.
  const syn = 1 + (s.synergy_bonus || 0);
  // A technique that is up right now counts too.
  const buff = { atk: 0, def: 0, evasion: 0 };
  for (const x of activeBuffs()) buff[x.stat] = (buff[x.stat] || 0) + x.amount;
  return {
    hp: Math.round((100 + s.physique * 25) * (1 + r * 0.1) * b * syn) + g.hp,
    atk: Math.round((10 + (s.physique * 2 + s.comprehension * 1.5) * (1 + r * 0.08)) * b * syn) + g.atk + buff.atk,
    def: Math.round((5 + s.physique * 1.2 + r * 2) * b * syn) + g.def + buff.def,
    crit: Math.min(60, Math.round(5 + s.comprehension * 1.2 + s.fortune * 0.5 + g.crit)),
    critDmg: Math.round(150 + s.fortune * 4 + s.comprehension * 1.5) + g.critDmg,
    qi_rate_pct: g.qi_rate_pct,
    agility: (s.agility || 0) + g.agility,
    luck: (s.luck || 0) + g.luck,
    spirit: (s.spirit || 0) + g.spirit,
    evasion: (s.evasion || 0) + g.evasion + buff.evasion,
    energy: 100 + (s.energy || 0) + g.energy,
    cdr: Math.min(75, (s.cdr || 0) + g.cdr),
  };
}

function updateQi(p) {
  $("p-name").textContent = p.username;
  const ss = $("p-stones");
  if (ss) ss.textContent = String(p.spirit_stones | 0);
  // Single source of truth: always the current stage cost, never a stale
  // cached cultivation_to_next (bar and button can never disagree).
  const cost = stageOf(p).cost;
  p.cultivation_to_next = cost;
  $("qi-bar").style.width = Math.min(100, cost > 0 ? p.cultivation / cost * 100 : 100) + "%";
  // Character panel HP + Qi stay live between full re-renders.
  const ch = $("char-hp");
  if (ch && REALM_TABLE.length) {
    const max = playerMaxHp(p);
    ch.textContent = `${Math.ceil(p.hp > 0 ? p.hp : max)} / ${max}`;
  }
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
    // No resting regen: wounds are closed by medicine, not by standing still.
    saveLocal(p);
  }, 1000);
  syncTimer = setInterval(() => syncPlayer(false), 30000);
}

// Admin state (maintenance, announcement, restart count) has its own poll,
// started at boot rather than on entering the game. Coupling it to the
// gameplay tick meant /announce did nothing until you were in the game and
// still went stale whenever the tab was backgrounded, because browsers
// throttle setInterval in hidden tabs. Polling here, and again whenever the
// tab comes back to the front, makes admin commands land live everywhere.
function startServerStatePoll() {
  if (serverStateTimer) clearInterval(serverStateTimer);
  serverStateTimer = setInterval(pollServerState, 5000);
  pollServerState();
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
    const body = JSON.stringify({
      username: p.username, cultivation: p.cultivation, realm_idx: p.realm_idx,
      bottleneck: p.bottleneck, dao_insight: p.dao_insight, seclusion: p.seclusion,
      equipment: p.equipment, inventory: p.inventory, elixirs: p.elixirs,
      spirit_stones: p.spirit_stones | 0,
      mastery_battle: masteryXp("battle"),
      skills: p.skills || [],
    });
    let r = await fetch("/api/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body,
    });
    let j = await r.json();
    // The server does not know this cultivator (its save file was lost, or it
    // is a fresh server). The player still carries the cultivator in their
    // own save, so it is handed over once and the sync is tried again.
    if (j.error && /Unknown cultivator/i.test(j.error) && await adoptPlayer(p)) {
      r = await fetch("/api/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body,
      });
      j = await r.json();
    }
    // Maintenance refuses writes with 503; surface it right away rather than
    // waiting for the next poll. Progress stays local until it lifts.
    if (j.error === "maintenance") {
      applyServerState({ maintenance: { on: true, message: j.message || "" },
                        announcement: "", restart_seq: serverState.restartSeq });
      if (!initial) cEvent("The heavens are quiet — progress is held locally while maintenance runs.");
      return;
    }
    if (j.ok && j.player) {
      // hp is client-tracked; the server only holds null — never let it clobber
      if (!(j.player.hp > 0)) delete j.player.hp;
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
  if (!document.hidden) {
    // Hidden tabs are throttled, so the admin poll goes quiet in the
    // background. Catch up the moment the player comes back.
    pollServerState();
  }
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
  if (p.cultivation < st.cost) {
    cEvent(`Bottleneck holds. Need ${st.cost - Math.floor(p.cultivation)} more qi. Fortune ${p.stats.fortune} watches.`);
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
  // The new realm hardens the body: the stat gains are shown in the corner
  // as they happen, the same way a new piece of gear reports itself.
  const before = derivedStats(p);
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
  notifyStatChange(before, derivedStats(p), `New Realm — ${p.realm}`);
  syncPlayer(false);
}

document.querySelectorAll(".side-btn").forEach(b => b.onclick = () => {
  // A tooltip left over from the last panel would float over this one and
  // swallow the clicks underneath it.
  hideTip();
  if (b.dataset.tab !== "battle") {
    // Leaving the battle panel mid-hunt auto-leaves the fight:
    // persist HP, stop ticks, clear the loot log, reset to the area list.
    if (battle.timer || battle.view === "combat") leaveActiveHunt();
    else stopBattle();
  } else if (battle.view === "areas") {
    showBattleAreas(); // refresh realm locks after breakthroughs
  }
  if (b.dataset.tab === "inventory") renderInventory();
  if (b.dataset.tab === "craft") renderWork("craft-root", "craft");
  if (b.dataset.tab === "alchemy") renderWork("alchemy-root", "alchemy");
  if (b.dataset.tab === "cook") renderWork("cook-root", "cook");
  if (b.dataset.tab === "skills") renderSkills();
  if (b.dataset.tab === "gather") renderGather();
  if (b.dataset.tab === "mail") loadMail();
  pollServerState(); // a fresh panel should never show stale admin state
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

// The sidebar floats over the canvas, so clicking the canvas puts it away.
function closeSidebar() {
  const sb = $("sidebar");
  if (!sb || !sb.classList.contains("open")) return;
  sb.classList.remove("open");
  $("hamburger").classList.add("collapsed");
}
document.querySelector(".content").addEventListener("click", closeSidebar);

// ---------- inventory + equipment (v0.7.0) ----------
let invTab = "all";
let invSort = "rarity";

// How the bag can be ordered.
const BAG_SORTS = [["rarity", "Rarity"], ["quantity", "Quantity"], ["name", "Name"]];

// Order the bag: the rarest first, or the biggest stack first, or by name.
function sortBag(entries, p) {
  const rank = id => {
    const r = (ITEM_BY_ID[id] || {}).rarity;
    const i = ITEM_RARITY_ORDER.indexOf(r);
    return i < 0 ? 0 : i;
  };
  if (invSort === "quantity") {
    entries.sort((a, b) => (p.inventory[b] || 0) - (p.inventory[a] || 0) || a.localeCompare(b));
  } else if (invSort === "name") {
    entries.sort((a, b) => {
      const na = (ITEM_BY_ID[a] || {}).name || a, nb = (ITEM_BY_ID[b] || {}).name || b;
      return na.localeCompare(nb);
    });
  } else {
    entries.sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));
  }
  return entries;
}
let tipItem = null, tipHideTimer = null;
// Item rarity ladder (Common -> Primordial), mirroring ITEM_RARITY_COLORS in
// server.py. Roots keep their own Mortal -> Primordial ladder; this one is
// only for items.
const ITEM_RARITY_COLORS = { Common: "#9aa0a6", Uncommon: "#7cb342", Rare: "#42a5f5",
  Epic: "#ab47bc", Legendary: "#ffb300", Mythic: "#ff3d00",
  Divine: "#00e5ff", Primordial: "#ff2fd0" };
// Default item rarity when the server sends none.
const ITEM_DEFAULT_RARITY = "Common";
// Slots worn in pairs. Two rings are the same slot worn twice, not two
// different slots, so they take the best value per stat rather than adding up:
// a second ring must never dilute the first.
const PAIRED_SLOTS = ["ring1", "ring2"];

// Single source of truth for what an item/slot *is*. An item's type comes from
// its slot, so a sword reads "Main Weapon" and never "armor".
const SLOT_TYPE_LABELS = {
  main_weapon: "Main Weapon", sec_weapon: "Secondary Weapon",
  head: "Helmet / Circlet", chest: "Body Armor", core: "Cultivation Artifact",
  arm: "Arm Armor", back: "Cloak / Cape", boots: "Foot Armor", legs: "Leg Armor",
  ring: "Accessory", necklace: "Accessory", headpiece: "Artifact",
};
// Doll slots reuse the item labels (ring1/ring2 both mean "Accessory").
function slotTypeLabel(s) {
  return SLOT_TYPE_LABELS[s === "ring1" || s === "ring2" ? "ring" : s] || "";
}
const DOLL_ROWS = [
  [{ s: "sec_weapon", label: "Off-Hand" }, { s: "head", label: "Headgear" }, { s: "chest", label: "Cuirass" }],
  [{ s: "main_weapon", label: "Armament" }, { s: "core", label: "Spirit Core" }, { s: "arm", label: "Bracers" }],
  [{ s: "back", label: "Mantle" }, { s: "boots", label: "Warboots" }, { s: "legs", label: "Legguards" }],
  [{ s: "ring1", label: "Spirit Ring I" }, { s: "ring2", label: "Spirit Ring II" }, { s: "necklace", label: "Jade Pendant" }, { s: "headpiece", label: "Immortal Crown" }],
];
// Bag tabs. Gear is grouped by what it is worn for, not by its equip slot, so
// everything protective lives under Armor and every hand-held piece under
// Weapon.
const BAG_TABS = [
  ["all", "All"], ["material", "Materials"], ["herb", "Herbs"], ["consumable", "Consumable"],
  ["armor", "Armor"], ["weapon", "Weapon"], ["artifact", "Artifact"],
  ["accessory", "Accessory"],
];
// Which bag tab an item belongs to. Gear is bucketed by slot; everything else
// is its own tab.
const SLOT_BAG_TAB = {
  main_weapon: "weapon", sec_weapon: "weapon",
  head: "armor", chest: "armor", arm: "armor", back: "armor",
  boots: "armor", legs: "armor",
  core: "artifact", headpiece: "artifact",
  ring: "accessory", necklace: "accessory",
};
function bagTabOf(it) {
  if (!it) return "";
  if (it.kind === "gear") return SLOT_BAG_TAB[it.slot] || "artifact";
  if (it.kind === "herb") return "herb";
  return it.kind === "material" ? "material" : "consumable";
}
// Elixir slots are positional and keyed by what a pill does, not by name:
// 0 = heals only, 1 = grants qi only, 2 = heals and grants qi. A slot only
// wears a pill name once such a pill exists in the item database; until then
// it shows a neutral label, so nothing advertises a pill that cannot be found.
// The three consumable slots, named for what they hold rather than for what
// the pill does. `shape` is still what decides which pill fits; `id` is the
// stable slot identifier and `icon` is the art an empty slot draws.
const ELIXIR_SHAPES = [
  { id: "elixir_slot", shape: "heal", icon: "elixir_icon", fallback: "Elixir I", type: "Recovery Consumable" },
  { id: "pill_slot", shape: "qi", icon: "qi_pill_icon", fallback: "Elixir II", type: "Cultivation Consumable" },
  { id: "meal_slot", shape: "both", icon: "spirit_meal_icon", fallback: "Elixir III", type: "Restorative Consumable" },
];

// Which elixir slot a consumable belongs to, by what it does. Returns -1 when
// it fits no named slot.
function elixirPreferredSlot(it) {
  const i = ELIXIR_SHAPES.findIndex(s => s.shape === pillShape((it && it.use) || {}));
  return i >= 0 ? i : -1;
}

function pillShape(u) {
  if (u.heal_pct && u.qi_pct) return "both";
  if (u.heal_pct) return "heal";
  if (u.qi_pct) return "qi";
  return "";
}

// The three slot labels, resolved against the live item database.
function elixirSlots() {
  const cons = Object.keys(ITEM_BY_ID).map(k => ITEM_BY_ID[k])
    .filter(it => it.kind === "consumable");
  return ELIXIR_SHAPES.map(s => {
    const it = cons.find(x => pillShape(x.use || {}) === s.shape);
    // The slot always carries its own id and icon. Only the label and the
    // pill id depend on what currently fits the slot.
    return {
      slotId: s.id, icon: s.icon, pillId: it ? it.id : null,
      name: it ? it.name : s.fallback, type: s.type,
    };
  });
}

// Tooltip type line. Gear is typed by its equip slot; consumables borrow the
// named elixir slot they occupy; everything else falls back to its kind.
function itemTypeLabel(it) {
  if (!it) return "";
  if (it.kind === "gear") return SLOT_TYPE_LABELS[it.slot] || "Gear";
  if (it.kind === "consumable") {
    const e = elixirSlots().find(x => x.name === it.name);
    return e ? e.type : "Consumable";
  }
  return it.kind === "material" ? "Material" : it.kind === "herb" ? "Herb" : "Item";
}

// Art for an item or enemy: the server sends `img` when a file matches the
// entity's id in public/assets, otherwise the emoji glyph stands in.
function iconHtml(img, glyph, artCls) {
  return img ? `<img class="art ${artCls}" src="${esc(img)}" alt="" />`
             : `<span class="glyph">${esc(glyph || "")}</span>`;
}

// Art from public/assets/icons is white line art, not a colour illustration.
// Item art normally renders at full strength against the dark slots, so those
// two items would show up as a solid white blob; `lineArt` is the server's
// flag for them and gets the same dimming the other slot icons use.
function artCls(it, base) {
  return base + (it && it.lineArt ? " line-art" : "");
}

// What should bag gear do: equip another, or unequip what's worn?
// Unequip wins when there is nothing left to equip.
function bagGearAction(itemId) {
  const p = state.player, it = ITEM_BY_ID[itemId];
  if (!it || it.kind !== "gear" || !((p.inventory[itemId] || 0) > 0)) return null;
  const targets = equipTargets(it);
  const free = targets.find(s => !p.equipment[s]);
  if (free) return { act: "equip", slot: free };
  // All targets occupied: unequip the first one.
  return { act: "unequip", slot: targets[0] };
}

// Which beasts drop an item, the best chance any of them offers, and the
// quantity. Answers the only question a material tooltip really has: where
// does this come from?
function dropsFor(itemName) {
  const out = [];
  for (const a of battle.areas || []) {
    for (const m of a.mobs || []) {
      let best = null;
      for (const l of m.loot || []) {
        if (l.item !== itemName) continue;
        if (!best || l.chance > best.chance) best = l;
      }
      if (best) out.push({ mob: m.name, area: a.name, chance: best.chance,
                           rarity: best.rarity, min: best.min, max: best.max });
    }
  }
  return out.sort((x, y) => y.chance - x.chance);
}

// Equipment uses additive bonuses across every slot. Percentage stats are
// shown with % because crit is in percentage points and Qi Rate is a bonus.
const GEAR_STAT_KEYS = ["atk", "def", "hp", "crit", "critDmg", "qi_rate_pct",
  "agility", "luck", "spirit", "evasion", "energy", "cdr"];
const STAT_DISPLAY_NAMES = {
  atk: "ATK", def: "DEF", hp: "HP", crit: "Crit Chance",
  critDmg: "Crit Damage", qi_rate_pct: "Qi Rate",
  agility: "Agility", luck: "Luck", spirit: "Spirit", evasion: "Evasion",
  energy: "Energy", cdr: "Cooldown Reduction",
};
const PERCENT_STAT_KEYS = new Set(["crit", "critDmg", "qi_rate_pct", "cdr", "agility", "luck", "evasion"]);
// The rarity ladder, in order, so the bag can sort by it.
const ITEM_RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Divine", "Primordial"];

function formatStatValue(key, value, withSign = false) {
  const n = Number(value) || 0;
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${n}${PERCENT_STAT_KEYS.has(key) ? "%" : ""}`;
}

function formatStatEntry(key, value) {
  return `${STAT_DISPLAY_NAMES[key] || key} ${formatStatValue(key, value, true)}`;
}

// Hover tooltip. Layout: name + rarity / type / desc / stats / source /
// actions. Every item gets one; only the action buttons are conditional.
function itemTipHtml(itemId, ctx) {
  const it = ITEM_BY_ID[itemId];
  if (!it) return "";
  ctx = ctx || {};
  const col = ITEM_RARITY_COLORS[it.rarity] || ITEM_RARITY_COLORS[ITEM_DEFAULT_RARITY];
  let h = `<div class="tip-title"><b>${iconHtml(it.img, it.glyph, artCls(it, "art-tip"))} ${esc(it.name)}</b><span class="tip-rarity" style="color:${col}">${esc(it.rarity || ITEM_DEFAULT_RARITY)}</span></div>` +
    `<div><small class="muted">${esc(itemTypeLabel(it))}</small></div>` +
    `<div class="muted">${esc(it.desc)}</div>`;
  const st = Object.entries(it.stats || {}).filter(([, v]) => v)
    .map(([k, v]) => formatStatEntry(k, v)).join(" · ");
  if (st) h += `<div><span class="inv-stats">${esc(st)}</span></div>`;
  // Drop source: essential for materials, useful everywhere else.
  const src = dropsFor(it.name);
  if (src.length) {
    const shown = src.slice(0, 4).map(d => {
      const c = ITEM_RARITY_COLORS[d.rarity] || "";
      const qty = d.min === d.max ? `${d.min}x` : `${d.min}-${d.max}x`;
      return `<div><span style="color:${c}">${esc(d.mob)}</span>` +
             `<span class="loot-rar">${esc(d.rarity || "")}</span>` +
             `<span class="loot-qty">${esc(qty)}</span>` +
             `<span class="loot-pct">${Math.round(d.chance * 100)}%</span></div>`;
    }).join("");
    const more = src.length > 4 ? `<div class="tip-more">+${src.length - 4} more</div>` : "";
    h += `<div class="tip-src"><div class="tip-src-head">Drops from</div>${shown}${more}</div>`;
  }
  if (it.kind === "gear" && !ctx.unequip) {
    const p = state.player;
    const targets = it.slot === "ring" ? ["ring1", "ring2"] : [it.slot];
    // Preview the same slot equipItem will choose: free first, then a slot
    // not already wearing this item, then the first slot as a final fallback.
    const targetSlot = p && p.equipment
      ? (targets.find(s => !p.equipment[s])
          || targets.find(s => p.equipment[s] !== itemId)
          || targets[0]) : targets[0];
    const cur = p && p.equipment ? (p.equipment[targetSlot] || null) : null;
    if (cur && cur !== itemId && ITEM_BY_ID[cur]) {
      const a = ITEM_BY_ID[cur].stats || {}, b = it.stats || {};
      const cmp = GEAR_STAT_KEYS
        .filter(k => (a[k] || 0) !== (b[k] || 0))
        .map(k => {
          const d = (b[k] || 0) - (a[k] || 0);
          return `<span class="${d > 0 ? "up" : "down"}">${STAT_DISPLAY_NAMES[k]} ${formatStatValue(k, a[k] || 0, true)} → ${formatStatValue(k, b[k] || 0, true)}</span>`;
        }).join(" · ") || `<span class="muted">identical stats</span>`;
      h += `<div><small class="muted">vs ${esc(ITEM_BY_ID[cur].name)}:</small><br/>${cmp}</div>`;
    }
  }
  const p = state.player;
  const owned = p && p.inventory ? (p.inventory[itemId] || 0) : 0;
  // Held count: for materials this is the only number that matters, and the
  // bag grid's "3x" badge is too small to read mid-hover.
  if (it.kind === "material") h += `<div><small class="muted">Held: ${owned}</small></div>`;
  // What it is worth: the buyer pays in spirit stones.
  if (it.value) h += `<div><small class="muted">Worth ${it.value} spirit stone${it.value === 1 ? "" : "s"}</small></div>`;
  let acts = "";
  if (ctx.plain) {
    // A plain look: the item, described, with no buttons to press.
  } else if (ctx.unequip) acts += `<button data-act="unequip" data-slot="${esc(ctx.unequip)}">Unequip</button>`;
  else if (ctx.unload != null) acts += `<button data-act="use">Use</button><button data-act="unload" data-slot="${ctx.unload}">Unequip</button>`;
  else if (it.kind === "gear" && owned > 0) {
    // Accurate label via the same rule the bag click uses.
    const a = bagGearAction(itemId);
    if (a && a.act === "unequip") acts += `<button data-act="unequip" data-slot="${esc(a.slot)}">Unequip</button>`;
    else acts += `<button data-act="equip">Equip</button>`;
  }
  else if (it.kind === "consumable" && owned > 0) {
    // Already loaded? Mirror the elixir-slot tooltip: Use + Unequip.
    const idx = p.elixirs ? p.elixirs.findIndex(x => x === itemId) : -1;
    if (idx >= 0) acts += `<button data-act="use">Use</button><button data-act="unload" data-slot="${idx}">Unequip</button>`;
    else acts += `<button data-act="use">Use</button><button data-act="elixir">Equip</button>`;
  }
  // Selling is a bag thing: what is worn or loaded is not for sale.
  // "Sell all" only earns its place when there is more than one to sell;
  // with a single copy it would say the same thing as "Sell".
  if (!ctx.plain && !ctx.unequip && ctx.unload == null && owned > 0 && it.value) {
    acts += `<button data-act="sell">Sell</button>`;
    if (owned > 1) acts += `<button data-act="sell-all">Sell all</button>`;
  }
  if (acts) h += `<div class="tip-actions">${acts}</div>`;
  return h;
}

let tipCtxKey = "", lastTipHtml = "";
function showTipHtml(html, x, y, key, itemId) {
  ensureTipWired();
  const tip = $("item-tip");
  if (!tip || !html) return;
  if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = null; }
  if (tipItem === itemId && tipCtxKey === key && tip.style.display === "block") {
    // Same target + context: keep the tooltip (and its buttons) perfectly
    // still — no rewrite, no reposition, no flicker.
    return;
  }
  if (lastTipHtml !== html) { tip.innerHTML = html; lastTipHtml = html; }
  tipItem = itemId;
  tipCtxKey = key;
  tip.style.display = "block";
  tip.classList.add("on");
  tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 10, x + 14) + "px";
  tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 10, y + 14) + "px";
}

function showTip(itemId, x, y, ctx) {
  const key = itemId + "|" + (ctx && ctx.unequip ? "u" + ctx.unequip : ctx && ctx.unload != null ? "l" + ctx.unload : "b");
  showTipHtml(itemTipHtml(itemId, ctx), x, y, key, itemId);
}

// Custom tooltip for empty slots: a plain "Empty" and how to fill it.
function showSlotTip(name, type, hint, x, y, key) {
  const html = `<div class="tip-title"><b>Empty</b></div>` +
    (hint ? `<div class="muted">${esc(hint)}</div>` : "");
  showTipHtml(html, x, y, "slot|" + key, null);
}

function hideTip() {
  const tip = $("item-tip");
  if (tip) { tip.classList.remove("on"); tip.style.display = "none"; }
  tipItem = null;
  tipCtxKey = "";
  // lastTipHtml intentionally kept: re-showing the same item skips the
  // innerHTML rewrite entirely.
  if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = null; }
}

// Grace period so the cursor can travel from the slot onto the tooltip.
//
// The tooltip does not take the pointer (it must never swallow a click on
// what lies under it), so it cannot be "hovered" in the ordinary way. Where
// the cursor actually is decides: if it is inside the tooltip's box, the
// tooltip stays.
function scheduleHideTip() {
  if (tipHideTimer) clearTimeout(tipHideTimer);
  tipHideTimer = setTimeout(() => {
    tipHideTimer = null;
    if (tipPointerOverTip()) return;   // the cursor is inside the tooltip
    hideTip();
  }, 350);
}

// Where the cursor is, and whether it is inside the tooltip's box.
let tipPointer = { x: 0, y: 0 };
let tipOnTip = false;

function tipPointerOverTip() {
  const tip = $("item-tip");
  if (!tip || tip.style.display !== "block") return false;
  if (!tip.getBoundingClientRect) return false;
  const r = tip.getBoundingClientRect();
  if (!r || (!r.width && !r.height)) return false;
  return tipPointer.x >= r.left && tipPointer.x <= r.right
      && tipPointer.y >= r.top && tipPointer.y <= r.bottom;
}

// The cursor is watched on the document, so it is still known while it is
// over the tooltip (which takes no pointer events of its own).
function watchTipPointer(e) {
  if (!e) return;
  tipPointer.x = e.clientX;
  tipPointer.y = e.clientY;
  const tip = $("item-tip");
  if (!tip || tip.style.display !== "block") return;
  if (tipPointerOverTip()) { tipOnTip = true; return; }
  if (tipOnTip) {
    // The cursor has left the tooltip: it may go now.
    tipOnTip = false;
    scheduleHideTip();
  }
}

function renderInventory() {
  const p = state.player;
  if (!p) return;
  hideTip();
  const root = $("inventory-root");
  if (!root) return;
  const doll = DOLL_ROWS.map(row => `<div class="doll-row">` + row.map(({ s, label }) => {
    const iid = p.equipment && p.equipment[s];
    const it = iid && ITEM_BY_ID[iid];
    // Icon only: the label lives in data-slot-name and still shows in the
    // tooltip, but an equipped slot shows nothing but its picture.
    return `<div class="slot${it ? " filled" : ""}" data-slot="${s}"${it ? ` data-tip="${iid}"` : ` data-slot-name="${esc(label)}" data-slot-type="${esc(slotTypeLabel(s))}"`}>` +
      (it ? iconHtml(it.img, it.glyph, artCls(it, "art-slot")) : slotIconHtml(s)) +
      `</div>`;
  }).join("") + `</div>`).join("");
  const slots = elixirSlots();
  const elix = `<div class="doll-row">` + [0, 1, 2].map(i => {
    const iid = p.elixirs && p.elixirs[i];
    const it = iid && ITEM_BY_ID[iid];
    const n = iid ? (p.inventory[iid] || 0) : 0;
    const slot = slots[i];
    // Empty slot draws its own art from assets/icons -- one per slot id, so
    // the three read apart at a glance. A filled slot shows the item instead.
    return `<div class="slot elixir${it ? " filled" : ""}" data-elixir="${i}" data-elixir-slot="${esc(slot.slotId)}"${it ? ` data-tip="${iid}"` : ` data-slot-name="${esc(slot.name)}" data-slot-type="${esc(slot.type)}"`}>` +
      (it ? iconHtml(it.img, it.glyph, artCls(it, "art-slot"))
          : iconImg(slot.icon, "slot-icon")) +
      (it ? `<span class="count">${n}x</span>` : "") + `</div>`;
  }).join("") + `</div>`;
  const tabs = BAG_TABS
    .map(([v, l]) => `<button class="inv-tab${invTab === v ? " active" : ""}" data-tab="${v}">${l}</button>`).join("");
  const sorts = BAG_SORTS
    .map(([v, l]) => `<button class="inv-sort${invSort === v ? " active" : ""}" data-sort="${v}">${l}</button>`).join("");
  // Hidden in bag while equipped: any consumable loaded into an elixir
  // slot, and worn gear with no free slot left (a spare ring still shows
  // while a finger is free so it can be worn too).
  const hidden = hiddenFromBag(p);
  const entries = Object.keys(p.inventory || {}).filter(id => {
    const it = ITEM_BY_ID[id];
    return it && (p.inventory[id] > 0) && !hidden.has(id)
      && (invTab === "all" || bagTabOf(it) === invTab);
  });
  sortBag(entries, p);
  const grid = entries.map(id => {
    const it = ITEM_BY_ID[id];
    const rc = ITEM_RARITY_COLORS[it.rarity] || ITEM_RARITY_COLORS[ITEM_DEFAULT_RARITY];
    // Every item gets the real tooltip; no native title (it would double up).
    return `<div class="slot inv-slot" data-item="${id}" data-tip="${id}"${rc ? ` style="--rc:${rc}"` : ""}>` +
      `${iconHtml(it.img, it.glyph, artCls(it, "art-slot"))}<span class="count">${p.inventory[id]}x</span></div>`;
  }).join("");
  // The bag holds what you carry and no more: there are no empty slots, and
  // an empty bag says so instead of showing a grid of blanks.
  const bag = entries.length
    ? `<div class="inv-grid">${grid}</div>`
    : `<div class="inv-empty-msg">Currently no Item Stored</div>`;
  root.innerHTML = `<div class="inv-layout"><div class="inv-doll"><h2>Equipment</h2>${doll}${elix}</div>` +
    `<div class="inv-bag"><h2>Bag</h2><div class="inv-tabs">${tabs}<span class="inv-sort-label">Sort</span>${sorts}</div>` +
    `${bag}</div></div>`;
  root.querySelectorAll(".slot[data-slot]").forEach(el => {
    // Clicking an equipped slot deliberately does nothing. It used to
    // unequip, which meant a stray click silently sent gear back to the bag
    // and then hid it from view (worn gear is filtered out of the bag grid),
    // so it looked like the item had vanished. Unequipping is now only via
    // the tooltip's explicit action.
    el.onmousemove = e => {
      if (el.dataset.tip) showTip(el.dataset.tip, e.clientX, e.clientY, { unequip: el.dataset.slot });
      else showSlotTip(el.dataset.slotName, el.dataset.slotType, "Bag → hover an item → Equip.", e.clientX, e.clientY, el.dataset.slot);
    };
    el.onmouseleave = scheduleHideTip;
  });
  root.querySelectorAll(".slot[data-elixir]").forEach(el => {
    el.onclick = () => useElixir(+el.dataset.elixir);
    el.onmousemove = e => {
      if (el.dataset.tip) showTip(el.dataset.tip, e.clientX, e.clientY, { unload: +el.dataset.elixir });
      else showSlotTip(el.dataset.slotName, el.dataset.slotType, "Bag → hover a pill → Equip.", e.clientX, e.clientY, "e" + el.dataset.elixir);
    };
    el.onmouseleave = scheduleHideTip;
  });
  root.querySelectorAll(".inv-tab").forEach(el => el.onclick = () => { invTab = el.dataset.tab; renderInventory(); });
  root.querySelectorAll(".inv-sort").forEach(el => el.onclick = () => { invSort = el.dataset.sort; renderInventory(); });
  root.querySelectorAll(".inv-slot").forEach(el => el.onclick = () => {
    const it = ITEM_BY_ID[el.dataset.item];
    // No equip-on-click in the bag: gear actions live on the tooltip
    // buttons only. Clicking a consumable still uses it.
    if (it && it.kind === "consumable") useConsumable(el.dataset.item);
  });
  root.querySelectorAll(".inv-slot").forEach(el => {
    el.onmousemove = e => showTip(el.dataset.tip, e.clientX, e.clientY);
    el.onmouseleave = scheduleHideTip;
  });
}

function equipTargets(it) {
  return it.slot === "ring" ? ["ring1", "ring2"] : [it.slot];
}

// What the bag keeps out of sight: what the player is wearing, and what is
// loaded into an elixir slot.
//
// A worn copy does not hide the rest of the stack: three spares are still
// three spares, and they must stay in the bag where the player can see them,
// sell them, or wear a second one. Only a stack with nothing left in it
// disappears.
function hiddenFromBag(p) {
  const hidden = new Set();
  const inv = (p && p.inventory) || {};
  const eq = (p && p.equipment) || {};
  (p.elixirs || []).filter(Boolean).forEach(id => {
    if (!(inv[id] > 0)) hidden.add(id);
  });
  Object.keys(eq).forEach(s => {
    const id = eq[s];
    const it = id && ITEM_BY_ID[id];
    if (!it) return;
    const t = equipTargets(it);
    if (t.some(x => eq[x] === id) && !t.some(x => !eq[x]) && !(inv[id] > 0)) hidden.add(id);
  });
  return hidden;
}

// ---------- stats notification: bottom-center popup on gear change ----------
const STAT_NOTICE_LABELS = {
  hp: "HP", atk: "ATK", def: "DEF", crit: "Crit Chance",
  critDmg: "Crit Damage", qi_rate_pct: "Qi Rate Bonus",
  agility: "Agility", luck: "Luck", spirit: "Spirit", evasion: "Evasion",
  energy: "Energy", cdr: "Cooldown Reduction",
};
const STAT_NOTICE_KEYS = GEAR_STAT_KEYS;

// Rows for a gear change. Up: "HP: 500 → +550" green, down: "HP: 550 ← 500"
// red. Empty string when no stat moved (no popup then).
function statNoticeHtml(before, after) {
  const rows = [];
  for (const k of STAT_NOTICE_KEYS) {
    const a = before[k] || 0, b = after[k] || 0;
    if (a === b) continue;
    const label = STAT_NOTICE_LABELS[k];
    if (b > a) rows.push(`<div><span>${label}: ${formatStatValue(k, a)} →</span> <b class="up">${formatStatValue(k, b, true)}</b></div>`);
    else rows.push(`<div><span>${label}: ${formatStatValue(k, a)} ←</span> <b class="down">${formatStatValue(k, b, true)}</b></div>`);
  }
  return rows.join("");
}

let statNoticeTimer = null;
function notifyStatChange(before, after, title) {
  const html = statNoticeHtml(before, after);
  if (!html && !title) return;
  let el = $("stat-notice");
  if (!el) {
    el = document.createElement("div");
    el.id = "stat-notice";
    document.body.appendChild(el);
  }
  el.innerHTML = (title ? `<div class="stat-notice-title">${esc(title)}</div>` : "") + html;
  el.classList.remove("show");
  void el.offsetWidth; // restart the fade-in
  el.classList.add("show");
  if (statNoticeTimer) clearTimeout(statNoticeTimer);
  statNoticeTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

function afterGearChange(before) {
  const p = state.player;
  clampHp(p);
  saveLocal(p);
  renderInventory();
  renderChar(p);
  refreshCultPanel();
  updateQi(p);
  syncPlayer(false);
  if (before) notifyStatChange(before, derivedStats(p));
}

function equipItem(itemId) {
  const p = state.player, it = ITEM_BY_ID[itemId];
  if (!it || it.kind !== "gear" || (p.inventory[itemId] || 0) <= 0) return;
  const targets = equipTargets(it);
  if (targets.every(s => p.equipment[s] === itemId)) return;
  const before = derivedStats(p);
  // Fill a free slot first. If both rings are occupied, replace a different
  // ring before ever swapping a duplicate with itself.
  const slot = targets.find(s => !p.equipment[s])
    || targets.find(s => p.equipment[s] !== itemId)
    || targets[0];
  const prev = p.equipment[slot];
  takeInv(itemId, 1);
  if (prev) addInv(prev, 1);
  p.equipment[slot] = itemId;
  afterGearChange(before);
}

function unequipSlot(slot) {
  const p = state.player;
  const prev = p.equipment && p.equipment[slot];
  if (!prev) return;
  const before = derivedStats(p);
  p.equipment[slot] = null;
  addInv(prev, 1);
  afterGearChange(before);
}

function useConsumable(itemId) {
  const p = state.player, it = ITEM_BY_ID[itemId];
  if (!it || it.kind !== "consumable" || (p.inventory[itemId] || 0) <= 0) return;
  const maxHp = playerMaxHp(p);
  const heals = (it.use.heal_pct || 0) > 0 && (p.hp || maxHp) < maxHp;
  const givesQi = (it.use.qi_pct || 0) > 0;
  if (!heals && !givesQi) return; // never waste a pill on full HP
  if (it.use.heal_pct) {
    const healed = Math.min(maxHp, (p.hp || maxHp) + maxHp * it.use.heal_pct / 100);
    p.hp = healed;
    // In a fight the wound is the fight's own hp: healing the save alone
    // would be wiped by the next mirror, and the medicine would do nothing.
    if (battle.timer && battle.view === "combat") battle.php = healed;
  }
  if (it.use.qi_pct) accrue(p, stageOf(p).cost * it.use.qi_pct / 100);
  takeInv(itemId, 1);
  if ((p.inventory[itemId] || 0) <= 0) {
    delete p.inventory[itemId];
    p.elixirs = p.elixirs.map(x => x === itemId ? null : x);
  }
  saveLocal(p);
  renderInventory();
  renderChar(p);
  refreshCultPanel();
  updateQi(p);
  paintBattleKit();   // the kit in the fight shows the new count
  paintBars();       // and the wound bar shows the medicine at once
  syncPlayer(false);
}

function loadElixirSlot(itemId) {
  const p = state.player, it = ITEM_BY_ID[itemId];
  if (!it || it.kind !== "consumable" || (p.inventory[itemId] || 0) <= 0) return;
  p.elixirs = p.elixirs.map(x => x === itemId ? null : x); // no duplicates
  const pref = elixirPreferredSlot(it);
  let i = pref >= 0 && !p.elixirs[pref] ? pref : p.elixirs.findIndex(x => !x);
  if (i < 0) i = pref >= 0 ? pref : 0;
  p.elixirs[i] = itemId;
  saveLocal(p);
  renderInventory();
  syncPlayer(false);
}

function useElixir(i) {
  const p = state.player;
  const iid = p.elixirs && p.elixirs[i];
  if (iid) useConsumable(iid);
}

function unloadElixir(itemId) {
  const p = state.player;
  p.elixirs = p.elixirs.map(x => x === itemId ? null : x);
  saveLocal(p);
  renderInventory();
  syncPlayer(false);
}

// ---------- techniques (skills) ----------
// The server owns the technique table; the player chooses which ones to
// carry. They fire on their own once their cooldown is up and there is
// energy for them, so the fight plays itself.
let SKILLS = {};
let SKILL_SLOTS = 3;
// Whether the manual has been asked for already. Without this the panel
// would ask again on every repaint and never stop.
let SKILLS_LOADED = false;

async function fetchSkills() {
  try {
    const r = await fetch("/api/skills", { cache: "max-age=3600" });
    const j = await r.json();
    if (j && Array.isArray(j.skills)) {
      SKILLS = {};
      for (const s of j.skills) SKILLS[s.id] = s;
    }
    if (j && j.slots) SKILL_SLOTS = j.slots;
  } catch {}
  // Asked once, asked done: a server that cannot answer must not spin us.
  SKILLS_LOADED = true;
  return SKILLS;
}

// The techniques the player carries, in order.
function equippedSkills(p) {
  const ids = (p && p.skills) || [];
  return ids.filter(Boolean).map(id => SKILLS[id]).filter(Boolean);
}

// The buffs that are up right now.
function activeBuffs() {
  const now = battle.clock;
  return (battle.buffs || []).filter(b => b.until > now);
}

// A technique's real wait, after the cooldown reduction.
function skillCooldown(s, d) {
  const cdr = d ? Math.max(0, Math.min(75, d.cdr || 0)) : 0;
  return Math.max(1, s.cd * (1 - cdr / 100));
}

// Techniques fire on their own: cooldown up, energy there, and the moment
// right. The player chose what to carry, not when to swing it.
function useSkills(p, m) {
  const d = derivedStats(p);
  for (const s of equippedSkills(p)) {
    if ((battle.cooldowns[s.id] || 0) > 0) continue;
    if (s.kind === "energy") {
      if (battle.energy >= d.energy - 1) continue;   // no point when full
    } else if (battle.energy < (s.energy || 0)) continue;
    if (s.kind === "buff") {
      const wanted = Object.keys(s.buff || {});
      if (activeBuffs().some(b => wanted.indexOf(b.stat) >= 0)) continue;
    }
    fireSkill(p, m, s, d);
  }
}

// One technique, used.
function fireSkill(p, m, s, d) {
  if (s.kind === "buff") {
    for (const stat of Object.keys(s.buff || {}))
      battle.buffs.push({ stat, amount: s.buff[stat], until: battle.clock + (s.duration || 5) });
    cEvent(`${s.name} takes hold.`);
  } else if (s.kind === "strike") {
    // Spirit is accuracy: it decides whether the technique finds its mark.
    const hit = Math.random() * 100 < Math.min(100, 85 + (d.spirit || 0));
    if (hit) {
      const hits = s.hits || 1;
      let total = 0;
      for (let i = 0; i < hits; i++) {
        total += Math.max(1, Math.round(d.atk * (s.mult || 1) * (1 + (d.spirit || 0) / 100)
          * (0.9 + Math.random() * 0.2) - (m.def || 0) * 0.5));
      }
      battle.ehp -= total;
      battle.lastSkill = s.name;
      flash("side-enemy");
      cEvent(`${s.name} strikes for ${total}.`);
    } else {
      battle.lastSkill = `${s.name} misses`;
      cEvent(`${s.name} finds only air.`);
    }
  } else if (s.kind === "energy") {
    battle.energy = Math.min(d.energy, battle.energy + (s.energy_gain || 0));
    battle.lastSkill = s.name;
    cEvent(`${s.name} fills the dantian.`);
  }
  battle.cooldowns[s.id] = skillCooldown(s, d);
  battle.energy = Math.max(0, battle.energy - (s.energy || 0));
}

// ---------- battle engine (v0.6.0): areas -> enemies -> auto combat ----------
const battle = {
  areas: [], view: "areas", area: null, mob: null,
  php: 1, ehp: 1, pbar: 0, ebar: 0, timer: null,
  searching: false, kills: 0, loot: {}, lastQi: 0, lastStones: 0,
  energy: 100, cooldowns: {}, buffs: [], clock: 0, lastSkill: "",
};

function lootKey() { return "af_loot_" + (state.username || "guest"); }
function loadLoot() {
  try { battle.loot = JSON.parse(localStorage.getItem(lootKey()) || "{}"); }
  catch { battle.loot = {}; }
}
function saveLoot() {
  try { localStorage.setItem(lootKey(), JSON.stringify(battle.loot)); } catch {}
}

// The loot log belongs to one hunt: leaving the fight wipes it.
function clearLootLog() {
  battle.loot = {};
  battle.kills = 0;
  saveLoot();
}

async function fetchAreas() {
  try {
    const r = await fetch("/api/areas", { cache: "no-store" });
    const j = await r.json();
    if (j.areas && j.areas.length) return j.areas;
  } catch {}
  return [];
}

// ---------- mastery ----------
// Five tracks, and every one of them works the same way: twelve ranks of ten
// levels (I-X), a named rank, and a bonus bought with each level. The herbs
// did it first; the trades and the hunt follow the same shape. The rank
// tables come from the server (/api/mastery), so a rank can never read one
// way here and another way there.
const MASTERY_TRACKS = ["cooking", "alchemy", "crafting", "battle", "herbs"];
const MASTERY_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const MASTERY_MAX_LEVEL = 120;
const MASTERY_XP_PER_KILL = 5;
let MASTERY_DEFS = {};        // track -> { label, ranks: [{name, bonus}], caps }
// The standing names, used only until the server's rank tables arrive.
const MASTERY_FALLBACK_RANKS = ["Beginner", "Artisan", "Master", "Grandmaster", "Sage",
  "Elder", "Immortal", "Legendary", "Mythic", "Transcendent"];
const MASTERY_BONUS_TEXT = {
  cooking: lvl => `${Math.max(0, lvl - 1)}% chance to duplicate the meal`,
  alchemy: lvl => `${Math.max(0, lvl - 1)}% chance to duplicate the brew`,
  crafting: lvl => `${Math.max(0, lvl - 1)}% chance to duplicate the work`,
  battle: lvl => `${(lvl - 1) * 2}% chance of an extra drop · +${lvl - 1}% HP, Attack, Defense`,
  herbs: lvl => "gathers faster, and finds more",
};

// The rank tables, from the server. Until they arrive the old names are used.
async function fetchMasteryDefs() {
  try {
    const r = await fetch("/api/mastery", { cache: "no-store" });
    const j = await r.json();
    if (j.tracks) MASTERY_DEFS = j.tracks;
  } catch {}
  return MASTERY_DEFS;
}

function masteryTotalXp(level) { return 50 * level * (level - 1); }

function masteryLevel(xp) {
  let lvl = 1;
  xp = Math.max(0, xp | 0);
  while (lvl < MASTERY_MAX_LEVEL && masteryTotalXp(lvl + 1) <= xp) lvl++;
  return lvl;
}

// The rank a level stands in, and the level inside it.
function masteryRankOf(track, level) {
  const def = MASTERY_DEFS[track];
  const ranks = (def && def.ranks) || [];
  if (ranks.length) {
    const idx = Math.min(ranks.length - 1, Math.floor((level - 1) / 10));
    const within = (level - 1) % 10 + 1;
    return { rank: idx + 1, within, name: ranks[idx].name || "", def: ranks[idx] };
  }
  // Before the server answers, the old standing names are used.
  const idx = Math.min(MASTERY_FALLBACK_RANKS.length - 1, Math.floor((level - 1) / 10));
  const within = (level - 1) % 10 + 1;
  return { rank: idx + 1, within, name: MASTERY_FALLBACK_RANKS[idx], def: null };
}

function masteryRank(level) {
  return masteryRankOf("cooking", level).name;
}

function masteryNumeral(level) { return MASTERY_NUMERALS[(level - 1) % 10]; }

// The rank's own name, WITHOUT the level inside it: "Novice Cook".
// The numeral is added once, by whoever shows it.
function masteryRankLabel(track, level) {
  const r = masteryRankOf(track, level);
  const def = MASTERY_DEFS[track];
  // The server's rank names carry the track already ("Adept Cook"); the
  // standing fallback names do not, so the track is put in front of them.
  if (def) return r.name;
  return `${(def && def.label) || (track[0].toUpperCase() + track.slice(1))} ${r.name}`;
}

// "Adept Cook IV" -- the rank's own name, and the level inside it.
function masteryTitle(track, level) {
  const r = masteryRankOf(track, level);
  return `${masteryRankLabel(track, level)} ${MASTERY_NUMERALS[r.within - 1]}`;
}

// What the track's level buys, in words.
function masteryBonusText(track, lvl) {
  const def = MASTERY_DEFS[track];
  if (!def || !def.ranks || !def.ranks.length) {
    return MASTERY_BONUS_TEXT[track] ? MASTERY_BONUS_TEXT[track](lvl) : "";
  }
  const r = masteryRankOf(track, lvl);
  const row = r.def || {};
  const cap = def.bonus_cap != null ? def.bonus_cap : 100;
  const bonus = Math.min(cap, (row.bonus || 0) * r.within);
  if (track === "battle") {
    const body = Math.min(def.body_cap != null ? def.body_cap : 100,
      (def.body_per_level || 0) * Math.max(0, lvl - 1));
    return `${bonus.toFixed(1).replace(/\.0$/, "")}% chance of an extra drop · +${body.toFixed(0)}% HP, Attack, Defense`;
  }
  if (track === "herbs") {
    const red = Math.min(def.time_reduction_cap || 0, (row.time_reduction || 0) * r.within);
    return `${red.toFixed(1).replace(/\.0$/, "")}% faster gathers · ${bonus.toFixed(1).replace(/\.0$/, "")}% chance of a second herb`;
  }
  return `${bonus.toFixed(1).replace(/\.0$/, "")}% ${def.gift || ""}`;
}

// The body the hunt's mastery hardens.
function masteryBodyBonus(track, xp) {
  const def = MASTERY_DEFS[track];
  const lvl = masteryLevel(xp);
  if (!def) return 0.01 * Math.max(0, lvl - 1);
  const cap = (def.body_cap != null ? def.body_cap : 100) / 100;
  return Math.min(cap, ((def.body_per_level || 0) * Math.max(0, lvl - 1)) / 100);
}

function masteryXp(track, p) {
  const pl = p || (state && state.player);
  const m = (pl && pl.mastery) || {};
  const raw = m[track];
  // The server sends the whole track (xp, level, rank); the local copy may be
  // a plain XP figure. Both are read the same way.
  if (raw && typeof raw === "object") return Math.max(0, raw.xp | 0);
  return Math.max(0, raw | 0);
}

// How much a kill teaches: the stronger the beast, the more it teaches.
function masteryKillXp(m) {
  const qi = Math.max(0, (m && m.qi) | 0);
  return MASTERY_XP_PER_KILL * (1 + Math.floor(qi / 6));
}

// Take the new XP, and if it carried a level, say so.
function applyMasteryXp(track, xp) {
  const p = state.player;
  if (!p) return 1;
  const before = masteryLevel(masteryXp(track));
  p.mastery = p.mastery || {};
  p.mastery[track] = Math.max(0, xp | 0);
  const after = masteryLevel(p.mastery[track]);
  if (after > before) masteryPopup(track, before, after);
  // The character panel shows the masteries: it must not wait for a reload.
  refreshMasteryPanel();
  return after;
}

// The level-up notice: "Cooking Mastery 9 -> 10", and when the rank turns
// over, the old name and the new one. It joins the bottom-right stack and
// fades away on its own.
function masteryPopup(track, fromLevel, toLevel) {
  const name = (MASTERY_DEFS[track] && MASTERY_DEFS[track].label)
    || (track[0].toUpperCase() + track.slice(1));
  const el = document.createElement("div");
  el.className = "toast mastery-toast";
  const rankLine = masteryTitle(track, fromLevel) !== masteryTitle(track, toLevel)
    ? `<p class="mastery-rank">${esc(masteryTitle(track, fromLevel))} -> ${esc(masteryTitle(track, toLevel))}</p>`
    : "";
  el.innerHTML = `<b>${esc(name)} Mastery ${fromLevel} -> ${toLevel}</b>${rankLine}`;
  toastBox().appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-out");
    setTimeout(() => { if (el.remove) el.remove(); }, 400);
  }, 3600);
}

// The techniques panel: what you carry on the left, everything you could
// carry on the right.
function renderSkills() {
  const root = $("skills-root");
  const p = state.player;
  if (!root || !p) return;
  if (!Object.keys(SKILLS).length) {
    if (!SKILLS_LOADED) {
      root.innerHTML = `<p class="muted">Consulting the manual…</p>`;
      fetchSkills().then(() => renderSkills());
      return;
    }
    // Asked already and still nothing: say so rather than ask forever.
    root.innerHTML = `<p class="muted">The manual is empty — the server has no techniques to give.</p>`;
    return;
  }
  const carried = (p.skills || []).filter(Boolean);
  const card = s => `<div class="skill-art-wrap"><img class="skill-art" src="${esc(s.img || "/assets/items/place_holder.jpg")}" alt="" /></div>` +
    `<div class="skill-text"><b>${esc(s.name)}</b><small class="muted">${s.cd}s cooldown${s.energy ? ` · ${s.energy} energy` : ""}</small><p class="muted">${esc(s.desc)}</p></div>`;
  const slots = Array.from({ length: SKILL_SLOTS }, (_, i) => {
    const s = SKILLS[(p.skills || [])[i]];
    return `<div class="skill-card${s ? " on" : " empty"}" data-slot="${i}">` +
      (s ? card(s) : `<div class="skill-empty">Empty slot</div>`) + `</div>`;
  }).join("");
  const all = Object.values(SKILLS).map(s =>
    `<div class="skill-card${carried.indexOf(s.id) >= 0 ? " on" : ""}" data-skill="${s.id}">${card(s)}</div>`).join("");
  root.innerHTML =
    `<h2>Techniques</h2>` +
    `<p class="muted">They fire on their own once their cooldown is up and there is energy for them. Carry ${SKILL_SLOTS}.</p>` +
    `<div class="skill-layout">
      <div class="skill-side"><h3>Carried</h3><div class="skill-slots">${slots}</div></div>
      <div class="skill-side"><h3>All techniques</h3><div class="skill-cards">${all}</div></div>
    </div>`;
  root.querySelectorAll("[data-skill]").forEach(el => el.onclick = () => toggleSkill(el.dataset.skill));
}

// Carry a technique, or set it down.
function toggleSkill(skillId) {
  const p = state.player;
  if (!p || !SKILLS[skillId]) return;
  const list = (p.skills || []).slice(0, SKILL_SLOTS);
  while (list.length < SKILL_SLOTS) list.push(null);
  const at = list.indexOf(skillId);
  if (at >= 0) {
    list[at] = null;
  } else {
    const free = list.indexOf(null);
    if (free < 0) { toast("All three technique slots are taken."); return; }
    list[free] = skillId;
  }
  p.skills = list;
  saveLocal(p);
  renderSkills();
  syncPlayer(false);
}

// Sell what is in the bag. The buyer is server-side: it checks the bag,
// takes the goods and pays the stones.
async function sellItem(itemId, count) {
  const p = state.player;
  if (!p) return;
  let j = null;
  try {
    const r = await fetch("/api/sell", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: p.username, item_id: itemId, count }),
    });
    j = await r.json();
  } catch {
    toast("The buyer will not answer.");
    return;
  }
  if (!j || j.error) {
    toast("The buyer refuses: " + (j && j.error ? j.error : "no reason given"));
    return;
  }
  if (j.ok && j.player) {
    p.inventory = j.player.inventory;
    p.spirit_stones = j.player.spirit_stones | 0;
    const it = ITEM_BY_ID[j.sold] || {};
    const line = `Sold ${j.count} ${it.name || j.sold} for ${j.earned} stone${j.earned === 1 ? "" : "s"}`;
    cEvent(line + ".");
    toast(line + ".");
    saveLocal(p);
    updateQi(p);
    renderInventory();
  }
}

// ---------- gathering ----------
// The player picks a herb node and the gathering goes on by itself: the
// server works out the time and the yield, and the client keeps asking
// until the player stops.
let HERBS = [];
let herbRank = 1, herbLevel = 1, herbRankName = "";
let gathering = null;   // { herbId, timer }

// A wait in seconds, as the player reads it: 6s, 5.4s, 70s.
function fmtSeconds(v) {
  const n = +v || 0;
  if (n >= 10) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

async function fetchHerbs() {
  const p = state.player;
  try {
    const url = p && p.username
      ? "/api/herbs?username=" + encodeURIComponent(p.username)
      : "/api/herbs";
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    if (j.herbs) {
      HERBS = j.herbs;
      herbRank = j.rank || 1;
      herbLevel = j.level || 1;
      herbRankName = j.rank_name || "";
    }
  } catch {}
  return HERBS;
}

function renderGather() {
  const root = $("gather-root");
  const p = state.player;
  if (!root || !p) return;
  if (!HERBS.length) {
    root.innerHTML = `<p class="muted">Looking for a herb patch…</p>`;
    fetchHerbs().then(() => renderGather());
    return;
  }
  // Every herb gets its own card, the whole list, the way the craft bench
  // shows every recipe: nothing is folded away behind a heading.
  const cards = HERBS.map(h => {
    const locked = h.locked;
    const active = gathering && gathering.herbId === h.id;
    const color = ITEM_RARITY_COLORS[h.rarity] || ITEM_RARITY_COLORS[ITEM_DEFAULT_RARITY];
    // The time the player actually waits: the herbalist rank gathers faster.
    const secs = h.now != null ? h.now : h.time;
    const action = locked
      ? `<span class="herb-lock">Needs rank ${h.need_rank}</span>`
      : `<button class="btn" data-herb="${h.id}"${active ? " disabled" : ""}>${active ? "Gathering…" : "Gather"}</button>`;
    return `<div class="craft-card gather-card${locked ? " locked" : ""}">
      <div class="craft-out">
        ${iconHtml(h.img, h.glyph || "🌿", "art-craft-out")}
        <div class="craft-out-text">
          <div class="craft-out-name"><b>${esc(h.name)}</b></div>
          <small class="gather-rarity" style="color:${color}">${esc(h.rarity)}</small>
        </div>
        <span class="craft-xp">${esc(h.element)} · ${fmtSeconds(secs)}s</span>
      </div>
      <p class="craft-note muted">${esc(h.desc || "")}</p>
      <div class="craft-actions">${action}</div>
    </div>`;
  }).join("");
  const status = gathering
    ? `<div class="gather-status">Gathering — <b>${esc((HERBS.find(h => h.id === gathering.herbId) || {}).name || "")}</b> <button class="btn" id="gather-stop">Stop</button></div>`
    : `<div class="gather-status muted">Pick a node and the gathering goes on by itself. Stop it whenever you like.</div>`;
  root.innerHTML =
    `<h2>Gathering</h2>` +
    `<p class="muted" id="gather-rank">Herbalist rank ${herbRank} · ${esc(herbRankName)} · level ${herbLevel}</p>` +
    status +
    `<div class="craft-list">${cards}</div>`;
  root.querySelectorAll("[data-herb]").forEach(el => el.onclick = () => startGathering(el.dataset.herb));
  const stop = $("gather-stop");
  if (stop) stop.onclick = () => stopGathering();
}

// Start (or keep) gathering one herb. It repeats until the player stops.
async function startGathering(herbId) {
  const p = state.player;
  if (!p || !herbId) return;
  if (gathering && gathering.herbId !== herbId) stopGathering();
  gathering = { herbId, timer: null };
  renderGather();
  await gatherOnce(herbId);
}

async function gatherOnce(herbId) {
  const p = state.player;
  if (!p || !gathering || gathering.herbId !== herbId) return;
  let j = null;
  try {
    const r = await fetch("/api/gather", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: p.username, herb_id: herbId }),
    });
    j = await r.json();
  } catch {
    cEvent("The patch is out of reach for now.");
    stopGathering();
    return;
  }
  if (!j || j.error) {
    // The server may have lost this cultivator: hand the save over once and
    // try the gathering again.
    if (j && /Unknown cultivator/i.test(j.error) && await adoptPlayer(p)) {
      return gatherOnce(herbId);
    }
    cEvent("The gathering stops: " + (j && j.error ? j.error : "unknown reason"));
    stopGathering();
    return;
  }
  if (j.ok && j.player) {
    p.inventory = j.player.inventory;
    const names = [];
    for (const id of Object.keys(j.gathered || {})) {
      const n = j.gathered[id];
      names.push(`${n}x ${(ITEM_BY_ID[id] || {}).name || id}`);
      // The herb says so in the bottom-right corner, in its own colour.
      herbToast(id, n);
    }
    if (names.length) cEvent("Gathered " + names.join(", ") + ".");
    saveLocal(p);
    renderInventory();
    // The herbalist track moved: the masteries must show it at once, not on
    // the next reload.
    if (j.mastery && j.mastery.herbs) {
      const h = j.mastery.herbs;
      p.mastery = p.mastery || {};
      p.mastery.herbs = h;
      if (h.rank !== herbRank || h.within !== herbLevel) {
        herbRank = h.rank; herbLevel = h.within; herbRankName = h.rank_name || "";
        cEvent(`${herbRankName}, level ${herbLevel}.`);
        // A new rank gathers faster, and opens new herbs: the panel asks
        // the server for the times and the locks as they stand now.
        fetchHerbs().then(() => renderGather());
      }
      refreshMasteryPanel();
      const rankLine = $("gather-rank");
      if (rankLine) rankLine.textContent =
        `Herbalist rank ${herbRank} · ${herbRankName} · level ${herbLevel}`;
    }
    // and again, until the player stops it
    gathering.timer = setTimeout(() => gatherOnce(herbId), Math.max(200, j.next_ms || 1000));
  }
}

function stopGathering() {
  if (gathering && gathering.timer) clearTimeout(gathering.timer);
  gathering = null;
  renderGather();
}

// The three trades ----------
// The forge owns the rule: it checks the materials, spends them and hands
// back the item. The client only draws the recipe table. Gear, pills and
// food each have their own bench, so they never share a panel.
let RECIPES = [];

const TRADES = {
  craft: { title: "Crafting", sub: "Hide, bone and spirit worked into gear.", verb: "Forge", done: "Forged" },
  alchemy: { title: "Alchemy", sub: "Cores, blood and bone ground into pills and elixirs.", verb: "Brew", done: "Brewed" },
  cook: { title: "Cooking", sub: "Raw parts turned into a hot meal.", verb: "Cook", done: "Cooked" },
};

async function fetchRecipes() {
  try {
    const r = await fetch("/api/recipes", { cache: "no-store" });
    const j = await r.json();
    if (j.recipes) RECIPES = j.recipes;
  } catch {}
  return RECIPES;
}

function craftReady(r, count) {
  const inv = (state.player && state.player.inventory) || {};
  return r.cost.every(c => (inv[c.id] || 0) >= c.need * count);
}

// How many of this recipe the materials on hand can pay for.
function craftMax(r) {
  const inv = (state.player && state.player.inventory) || {};
  let max = r.max_count || 20;
  for (const c of r.cost) {
    const can = Math.floor((inv[c.id] || 0) / c.need);
    if (can < max) max = can;
  }
  return Math.max(0, max);
}

// The bottom-right notice stack. Everything that shouts at you goes here.
function toastBox() {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    document.body.appendChild(box);
  }
  return box;
}

// Bottom-right notice: the forge reports faster than the eye can follow the
// event log, and the bag changes under the cursor.
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toastBox().appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-out");
    setTimeout(() => { if (el.remove) el.remove(); }, 400);
  }, 3200);
}

function renderWork(rootId, kind) {
  const root = $(rootId);
  const p = state.player;
  if (!root || !p) return;
  const trade = TRADES[kind] || TRADES.craft;
  if (!RECIPES.length) {
    root.innerHTML = `<p class="muted">Consulting the forge…</p>`;
    fetchRecipes().then(() => renderWork(rootId, kind));
    return;
  }
  const recipes = RECIPES.filter(r => (r.kind || "craft") === kind);
  // One entry per item: a pill made three ways is still one pill, so the
  // ways are folded into a single card instead of stacking three cards
  // that all read the same thing.
  const groups = [];
  for (const r of recipes) {
    const g = groups.find(x => x.out === r.out);
    if (g) g.ways.push(r);
    else groups.push({ out: r.out, ways: [r] });
  }
  const inv = p.inventory || {};
  root.innerHTML =
    `<h2>${esc(trade.title)}</h2>` +
    `<p class="muted">${esc(trade.sub)} Materials are spent for good.</p>` +
    `<div class="craft-list">` + groups.map(g => {
      const first = g.ways[0];
      const ways = g.ways.map(r => {
        const costs = r.cost.map(c => {
          const have = inv[c.id] || 0;
          const short = have < c.need;
          return `<div class="craft-cost${short ? " short" : ""}">
            <span class="craft-cost-name">${iconHtml(c.img, c.glyph, "art-craft")}<span style="color:${c.color || "inherit"}">${esc(c.name)}</span></span>
            <span class="craft-cost-qty">${have}/${c.need}</span>
          </div>`;
        }).join("");
        return `<div class="craft-way">
          ${g.ways.length > 1 ? `<div class="craft-way-name">${esc(r.label || r.id)}</div>` : ""}
          <div class="craft-costs">${costs}</div>
          <p class="craft-note muted">${esc(r.note || "")}</p>
          <div class="craft-actions">
            <button class="btn" data-recipe="${r.id}" data-craft="1"${craftReady(r, 1) ? "" : " disabled"}>${esc(trade.verb)}</button>
            <button class="btn" data-recipe="${r.id}" data-craft="max"${craftMax(r) > 0 ? "" : " disabled"}>${esc(trade.verb)} Max</button>
          </div>
        </div>`;
      }).join("");
      return `<div class="craft-card">
        <div class="craft-out">${iconHtml(first.out_img, first.out_glyph, "art-craft-out")}<div class="craft-out-text"><div class="craft-out-name"><b>${esc(first.out_name)}</b></div><small class="muted">${esc(first.out_rarity)}${first.count > 1 ? ` ×${first.count}` : ""}${g.ways.length > 1 ? ` · ${g.ways.length} ways` : ""}</small></div><span class="craft-xp" title="Mastery XP">+${first.xp || 0} XP</span></div>
        ${ways}
      </div>`;
    }).join("") + `</div>`;
  root.querySelectorAll("[data-craft]").forEach(btn => {
    btn.onclick = () => {
      const r = RECIPES.find(x => x.id === btn.dataset.recipe);
      if (!r) return;
      const n = btn.dataset.craft === "max" ? craftMax(r) : +btn.dataset.craft;
      if (n > 0) craftRecipe(r.id, n);
    };
  });
}

// A herb lands: the bottom-right corner says so, in the herb's own colour.
// The bag changes under the cursor, so the notice cannot wait for the log.
function herbToast(itemId, count) {
  const it = ITEM_BY_ID[itemId] || {};
  const color = ITEM_RARITY_COLORS[it.rarity] || "var(--gold2)";
  const el = document.createElement("div");
  el.className = "toast herb-toast";
  el.innerHTML =
    `<span class="herb-toast-glyph">${esc(it.glyph || "🌿")}</span>` +
    `<span class="herb-toast-name" style="color:${color}">${esc(it.name || itemId)}</span>` +
    `<span class="herb-toast-count">+${count | 0}</span>`;
  toastBox().appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-out");
    setTimeout(() => { if (el.remove) el.remove(); }, 400);
  }, 3200);
}

// One craft at a time: a second click while the first is still at the forge
// would ask for materials that are already spent.
let crafting = false;

async function craftRecipe(recipeId, count) {
  const p = state.player;
  if (!p || crafting) return;
  crafting = true;
  try {
    let j = null;
    try {
      const r = await fetch("/api/craft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: p.username, recipe_id: recipeId, count }),
      });
      j = await r.json();
    } catch {
      cEvent("The forge stays cold — the server did not answer.");
      return;
    }
    if (!j || j.error) {
      cEvent("The forge refuses: " + (j && j.error ? j.error : "unknown reason"));
      return;
    }
    if (j.ok && j.player) {
      p.inventory = j.player.inventory;
      const it = ITEM_BY_ID[j.crafted] || {};
      const trade = TRADES[j.kind] || TRADES.craft;
      const n = j.count * (j.duplicated ? 2 : 1);
      const made = `${trade.done} ${it.name || j.crafted} x${n}` +
        (j.duplicated ? " — mastery bonus" : "");
      cEvent(made + ".");
      toast(made);
      // the trade taught its own mastery (the server sends the whole track)
      const track = { craft: "crafting", alchemy: "alchemy", cook: "cooking" }[j.kind];
      const taught = track && j.mastery && j.mastery[track];
      if (taught && typeof taught.xp === "number") applyMasteryXp(track, taught.xp);
      saveLocal(p);
      // repaint the bench the player is standing at, with the new counts
      const kind = j.kind || "craft";
      renderWork({ craft: "craft-root", alchemy: "alchemy-root", cook: "cook-root" }[kind] || "craft-root", kind);
      renderInventory();
    }
  } finally {
    crafting = false;   // the forge is free again
  }
}

let ITEM_BY_ID = {};
let NAME_TO_ID = {};
const EQUIP_SLOT_LIST = ["head", "sec_weapon", "chest", "main_weapon", "core",
  "arm", "back", "boots", "legs", "ring1", "ring2", "necklace", "headpiece"];

async function fetchItems() {
  try {
    const r = await fetch("/api/items", { cache: "no-store" });
    const j = await r.json();
    if (j.items && j.items.length) {
      ITEM_BY_ID = {};
      NAME_TO_ID = {};
      for (const it of j.items) {
        ITEM_BY_ID[it.id] = it;
        NAME_TO_ID[it.name] = it.id;
      }
    }
  } catch {}
  return ITEM_BY_ID;
}

// ---------- UI icon art ----------
// Sidebar tabs, empty doll slots and elixir slots draw from
// public/assets/icons. The server lists what is actually on disk, so a name
// with no file simply has no entry and the UI keeps its text label -- icons
// can be added one file at a time without breaking the layout.
let ICON = {};

const TAB_ICONS = {
  character: "character_icon",
  cultivate: "cultivate_icon",
  battle: "battle_icon",
  inventory: "inventory_icon",
  craft: "craft_icon",
  alchemy: "alchemy_icon",
  cook: "cook_icon",
  skills: "skill_icon",
  gather: "herb_icon",
  mail: "mail_icon",
};

// Doll slot -> icon file. ring1/ring2 are the same ring, so both point at it.
const SLOT_ICONS = {
  head: "helmet_icon",
  sec_weapon: "secondary_weapon_icon",
  chest: "body_armor_icon",
  main_weapon: "main_weapon_icon",
  core: "cultivation_artifact_icon",
  arm: "arm_armor_icon",
  back: "cloak_cape_icon",
  boots: "foot_armor_icon",
  legs: "leg_armor_icon",
  ring1: "spirit_ring_icon",
  ring2: "spirit_ring_icon",
  necklace: "jade_pendant_icon",
  headpiece: "crown_artifact_icon",
};

async function fetchIcons() {
  try {
    const r = await fetch("/api/icons", { cache: "no-store" });
    const j = await r.json();
    if (j.icons) ICON = j.icons;
  } catch {}
  paintTabIcons();
  return ICON;
}

// Inline SVG-free <img>, or "" when the file is missing.
function iconUrl(name) {
  return ICON[name] || "";
}

function iconImg(name, cls) {
  const src = iconUrl(name);
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" />` : "";
}

// Icons sit beside the tab text and are decorative -- the label stays for
// screen readers and for any tab whose art is missing.
function paintTabIcons() {
  document.querySelectorAll(".side-btn").forEach(b => {
    const name = TAB_ICONS[b.dataset.tab];
    if (!name || b.querySelector(".tab-icon")) return;
    const img = iconImg(name, "tab-icon");
    if (img) b.insertAdjacentHTML("afterbegin", img);
  });
}

function slotIconHtml(slot) {
  return iconImg(SLOT_ICONS[slot] || "", "slot-icon");
}

// Add every equipped item's contribution. Both Spirit Ring slots are equal:
// two offensive, two defensive, two Qi-focused, and hybrid builds all work.
function gearBonus(p) {
  const b = Object.fromEntries(GEAR_STAT_KEYS.map(k => [k, 0]));
  if (!p.equipment) return b;
  const paired = PAIRED_SLOTS.map(() => []);
  for (const slot of EQUIP_SLOT_LIST) {
    const it = ITEM_BY_ID[p.equipment[slot]];
    if (!it || it.kind !== "gear" || !it.stats) continue;
    const pi = PAIRED_SLOTS.indexOf(slot);
    if (pi >= 0) { paired[pi].push(it.stats); continue; }
    for (const k of GEAR_STAT_KEYS) b[k] += Number(it.stats[k]) || 0;
  }
  // One max across the pair, not a max per ring.
  const worn = paired.flat();
  if (worn.length) {
    for (const k of GEAR_STAT_KEYS) {
      b[k] += Math.max(...worn.map(s => s[k] || 0));
    }
  }
  return b;
}

function stopBattle() {
  if (battle.timer) clearInterval(battle.timer);
  battle.timer = null;
  battle.searching = false;
}

// Exit whatever hunt is running (panel switch): save hp, stop the fight,
// wipe the loot log, and land back on the area list.
//
// The drops themselves are not lost: every drop went into the bag the
// moment it fell, so leaving says so rather than leaving the player to
// wonder.
function leaveActiveHunt() {
  if (battle.timer) persistBattleHp(false);
  const drops = Object.keys(battle.loot || {}).length;
  stopBattle();
  battle.mob = null;
  clearLootLog();
  showBattleAreas();
  if (drops) cEvent(`The hunt is over — ${drops} kind${drops === 1 ? "" : "s"} of loot are in your Bag.`);
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
  const p = state.player;
  const root = $("battle-root");
  root.innerHTML =
    `<div class="enemy-head"><h2>${esc(a.name)}</h2><button id="enemy-back" class="btn">Back</button></div>` +
    `<p class="enemy-notice">${esc(notice || "")}</p>` +
    `<div class="enemy-grid">` + a.mobs.map(m => {
      // A boss can demand more than the area around it, so the lock is per beast.
      const locked = (p.realm_idx | 0) < (m.req_idx || 0);
      const st = mobStones(m);
      const stQty = st.min === st.max ? `${st.min}x` : `${st.min}-${st.max}x`;
      return `<div class="enemy-card${m.boss ? " boss" : ""}${locked ? " locked" : ""}" data-mob="${m.id}" data-locked="${locked ? "1" : "0"}">
        <b>${esc(m.name)}</b>
        ${m.boss ? `<div class="boss-tag">Boss</div>` : ""}
        <div class="realm-tag">${esc(m.realm)}</div>
        ${m.difficulty ? `<div class="difficulty-tag ${esc(String(m.difficulty).toLowerCase().replace(/[^a-z]+/g, "-"))}">${esc(m.difficulty)}</div>` : ""}
        ${locked ? `<div class="locked-tag">Locked — needs ${esc(m.realm)}</div>` : ""}
        <div class="desc">${esc(m.desc)}</div>
        <div class="enemy-glyph">${iconHtml(m.img, m.glyph, "art-enemy")}</div>
        <div class="enemy-loot">Loot list<div class="loot-row loot-guaranteed">
            <span class="loot-name"><img class="stone-glyph" src="/assets/icons/spirit_stone.png" alt="" /> Spirit Stone</span>
            <span class="loot-rar">guaranteed</span>
            <span class="loot-qty">${stQty}</span>
            <span class="loot-pct">100%</span>
          </div>${m.loot.map(l => {
          const c = ITEM_RARITY_COLORS[l.rarity] || "";
          const qty = l.min === l.max ? `${l.min}x` : `${l.min}-${l.max}x`;
          return `<div class="loot-row">
            <span class="loot-name" style="color:${c}">${esc(l.item)}</span>
            <span class="loot-rar">${esc(l.rarity || "")}</span>
            <span class="loot-qty">${esc(qty)}</span>
            <span class="loot-pct">${Math.round(l.chance * 100)}%</span>
          </div>`;
        }).join("")}</div>
      </div>`;
    }).join("") + `</div>`;
  $("enemy-back").onclick = showBattleAreas;
  root.querySelectorAll(".enemy-card").forEach(el => {
    if (el.dataset.locked === "1") {
      el.onclick = () => cEvent("That beast is beyond you for now — your realm is not deep enough.");
      return;
    }
    el.onclick = () => {
      battle.mob = a.mobs.find(x => x.id === el.dataset.mob);
      startCombat();
    };
  });
}

function persistBattleHp(fainted) {
  const p = state.player;
  if (fainted) p.hp = playerMaxHp(p); // revive at full on defeat
  else p.hp = Math.max(0, Math.min(battle.php, playerMaxHp(p)));
  saveLocal(p);
}

function startCombat() {
  const p = state.player, m = battle.mob;
  battle.view = "combat";
  battle.php = p.hp > 0 ? Math.min(p.hp, playerMaxHp(p)) : playerMaxHp(p);
  battle.ehp = m.hp;
  battle.pbar = 0;
  battle.ebar = 0;
  battle.kills = 0;
  battle.searching = false;
  battle.lastQi = 0;
  battle.lastStones = 0;
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
      <div class="combat-side" id="side-enemy">${iconHtml(m.img, m.glyph, "art-big")}</div>
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
    `<div class="skill-bar" id="equipped-skills"></div>` +
    `<div class="battle-kit" id="battle-kit"></div>` +
    `<div class="loot-log"><h3>Loot log</h3><div class="loot-rows" id="loot-rows"></div>` +
    `<div class="kill-count" id="kill-count"></div></div>`;
  $("combat-leave").onclick = () => {
    persistBattleHp(false);
    stopBattle();
    battle.mob = null;
    clearLootLog();
    showBattleEnemies("");
  };
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

// The three consumable slots, as they stand right now: the elixir, the pill
// and the meal. They sit in the fight so a hungry or wounded cultivator can
// reach for them without leaving the hunt.
function paintBattleKit() {
  const root = $("battle-kit");
  const p = state.player;
  if (!root || !p) return;
  const slots = elixirSlots();
  root.innerHTML = slots.map((slot, i) => {
    const iid = p.elixirs && p.elixirs[i];
    const it = iid && ITEM_BY_ID[iid];
    const n = iid ? (p.inventory[iid] || 0) : 0;
    const usable = !!it && n > 0;
    // An empty slot shows its own art and says nothing: the name belongs to
    // the item, and there is no item yet.
    return `<div class="kit-slot${usable ? " ready" : ""}" data-elixir="${i}"${usable ? ` data-tip="${iid}"` : ` data-slot-name="Empty" data-slot-type="${esc(slot.type)}"`}>` +
      (it ? iconHtml(it.img, it.glyph, artCls(it, "art-slot")) : iconImg(slot.icon, "slot-icon")) +
      (usable ? `<span class="kit-count">${n}</span>` : "") +
      `</div>`;
  }).join("");
  root.querySelectorAll("[data-elixir]").forEach(el => {
    el.onclick = () => useElixir(+el.dataset.elixir);
    el.onmousemove = e => {
      // A plain look in the fight: no use, no unequip -- the click does it.
      if (el.dataset.tip) showTip(el.dataset.tip, e.clientX, e.clientY, { plain: true });
      else showSlotTip(el.dataset.slotName, el.dataset.slotType, "", e.clientX, e.clientY, el.dataset.elixir);
    };
    // Without this the tooltip stays on the screen after the cursor leaves.
    el.onmouseleave = scheduleHideTip;
  });
}

function paintCombat() {
  paintBars();
  const m = battle.mob;
  const p = state.player;
  // The equipped techniques sit above the loot log, with their cooldowns.
  const sk = $("equipped-skills");
  if (sk) {
    const d = p ? derivedStats(p) : null;
    const cards = equippedSkills(p).map(s => {
      const left = battle.cooldowns[s.id] || 0;
      const total = skillCooldown(s, d);
      const pct = left > 0 ? Math.max(0, Math.min(100, left / total * 100)) : 0;
      return `<div class="skill-slot${left > 0 ? " cooling" : ""}" data-skill="${s.id}" title="${esc(s.desc)}">
        <img class="skill-art" src="${esc(s.img || "/assets/items/place_holder.jpg")}" alt="" />
        <span class="skill-name">${esc(s.name)}</span>
        ${left > 0 ? `<span class="skill-cd" style="--pct:${pct}%">${Math.ceil(left)}s</span>` : ""}
      </div>`;
    }).join("");
    sk.innerHTML = cards || `<span class="muted">No techniques carried</span>`;
  }
  paintBattleKit();
  const lr = $("loot-rows");
  if (lr) lr.innerHTML = Object.keys(battle.loot).sort().map(k =>
    `<div><span>${esc(k)}</span><span>${battle.loot[k]}x</span></div>`).join("") ||
    `<div><span class="muted">No loot yet — slay something.</span><span></span></div>`;
  const kc = $("kill-count");
  if (kc) kc.textContent = battle.kills ? `${m.name} slain ×${battle.kills}` : "";
  const st = $("battle-status");
  if (st) st.innerHTML = battle.searching
    ? `<div class="searching">Searching for that same enemy…</div>`
    : "";
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
  // a survivor of a mutual kill still falls: check before trading blows
  if (battle.php <= 0) return onPlayerDeath();
  const d = derivedStats(p);
  battle.clock += 0.1;
  // Energy comes back on its own, and the techniques wait out their cooldowns.
  battle.energy = Math.min(d.energy, battle.energy + 5 * 0.1);
  for (const id of Object.keys(battle.cooldowns))
    battle.cooldowns[id] = Math.max(0, battle.cooldowns[id] - 0.1);
  battle.buffs = (battle.buffs || []).filter(b => b.until > battle.clock);
  // Agility: the swing comes faster.
  battle.pbar += 0.1 * (1 + (d.agility || 0) / 100);
  battle.ebar += 0.1 / m.speed;
  if (battle.pbar >= 1) {
    battle.pbar = 0;
    const s = strikeDmg(d.atk, d.crit, d.critDmg, m.def);
    battle.ehp -= s.dmg;
    flash("side-enemy");
  }
  if (battle.ebar >= 1 && battle.ehp > 0) {
    battle.ebar = 0;
    // Evasion: the blow never arrives.
    if (Math.random() * 100 < (d.evasion || 0)) {
      battle.lastSkill = "Dodged";
      flash("side-player");
    } else {
      const s = strikeDmg(m.atk, m.crit, m.crit_dmg, d.def);
      battle.php -= s.dmg;
      flash("side-player");
    }
  }
  // The techniques go on their own.
  useSkills(p, m);
  // mirror into the save every strike: hiding/reloading/closing mid-hunt
  // keeps the damage (no refresh-heal), and quit-mid-fight keeps the wound
  p.hp = battle.php;
  if (battle.ehp <= 0) return onMobDeath();
  if (battle.php <= 0) return onPlayerDeath();
  paintBars();
}

// Spirit stones ride with the kill: the server publishes a range per mob
// (it scales with the beast). An older area payload falls back to the same
// curve the server uses.
function mobStones(m) {
  if (!m) return { min: 0, max: 0 };
  const s = m.stones;
  if (s && typeof s === "object") {
    const lo = Math.max(0, s.min | 0);
    return { min: lo, max: Math.max(lo, s.max | 0) };
  }
  const lo = Math.max(1, (m.qi || 0) * 3 + 1);
  return { min: lo, max: lo * 2 };
}

// The purse one kill pays out.
function rollStones(m) {
  const s = mobStones(m);
  if (s.max <= 0) return 0;
  return s.min + Math.floor(Math.random() * (s.max - s.min + 1));
}

// One roll of a mob's loot table. The drops land in the hunt log and in the bag.
function rollLoot(m) {
  for (const l of m.loot) {
    if (Math.random() < l.chance) {
      const n = l.min + Math.floor(Math.random() * (l.max - l.min + 1));
      battle.loot[l.item] = (battle.loot[l.item] || 0) + n;
      const iid = NAME_TO_ID[l.item];
      if (iid) addInv(iid, n); // drops also land in the bag
    }
  }
}

function onMobDeath() {
  const p = state.player, m = battle.mob;
  battle.kills++;
  rollLoot(m);
  // A practised hunter finds more: every level of battle mastery adds a
  // chance of a second roll of the table.
  const bLevel = masteryLevel(masteryXp("battle"));
  if (bLevel > 1 && Math.random() < Math.min(0.5, 0.02 * (bLevel - 1))) rollLoot(m);
  // Luck finds a little more, too.
  if (Math.random() * 100 < (derivedStats(p).luck || 0)) rollLoot(m);
  // The kill itself teaches the hunt, and the stronger the beast the more
  // it teaches.
  applyMasteryXp("battle", masteryXp("battle") + masteryKillXp(m));
  accrue(p, m.qi);
  // Guaranteed drop on every kill, logged like any other loot. The count
  // scales with the enemy: the server publishes stones per mob from its qi,
  // so stronger prey pays far better than rats.
  const stones = rollStones(m);
  if (stones > 0) {
    p.spirit_stones = (p.spirit_stones | 0) + stones;
    battle.lastStones = stones;
    battle.loot["Spirit Stone"] = (battle.loot["Spirit Stone"] || 0) + stones;
  }
  saveLoot();
  saveLocal(p);
  updateQi(p);
  battle.searching = true;
  battle.lastQi = m.qi;
  battle.pbar = 0;
  battle.ebar = 0;
  paintCombat();
  setTimeout(() => {
    // Only the respawn we are still waiting on may fire: leaving and
    // re-entering combat (searching=false again) starts a fresh fight
    // that a stale timer must not heal back to full.
    if (battle.view !== "combat" || !battle.searching || battle.mob !== m) return;
    battle.ehp = m.hp;
    battle.searching = false;
    paintCombat();
  }, 2000);
}

function onPlayerDeath() {
  const name = battle.mob ? battle.mob.name : "the enemy";
  stopBattle();
  persistBattleHp(true);
  battle.mob = null;
  clearLootLog();
  showBattleEnemies(`You were defeated by ${name} — dragged out of the hunt. Heal up and return.`);
}

// boot
if (state.username) $("username-input").value = state.username;
checkServerFresh();
startServerStatePoll();
// The cursor is watched on the document: the tooltip takes no pointer
// events of its own (it must never swallow a click), so this is how the
// game knows the cursor is sitting inside it.
document.addEventListener("mousemove", watchTipPointer);
// The gate: the world is loaded before the game opens.
preloadWorld().then(async () => {
  // A cultivator who has been here before walks straight back in -- the
  // world is ready, and there is nothing left to ask.
  if (state.username && state.player && state.player.username === state.username) {
    const remote = await fetchServerPlayer(state.username);
    enterMain(remote || state.player);
  }
});

// Tooltip actions (delegated: tip content re-renders on every hover).
// Wired lazily so script order can never silently break the buttons again.
let tipWired = false;
function ensureTipWired() {
  if (tipWired) return;
  const tip = $("item-tip");
  if (!tip) return;
  tipWired = true;
  tip.addEventListener("click", e => {
    const act = e.target && e.target.dataset && e.target.dataset.act;
    if (!act || !tipItem) return;
    if (act === "equip") equipItem(tipItem);
    else if (act === "use") useConsumable(tipItem);
    else if (act === "elixir") loadElixirSlot(tipItem);
    else if (act === "unequip" && e.target.dataset.slot) unequipSlot(e.target.dataset.slot);
    else if (act === "unload") unloadElixir(tipItem);
    else if (act === "sell") sellItem(tipItem, 1);
    else if (act === "sell-all") sellItem(tipItem, 9999);
    hideTip();
  });
  tip.addEventListener("mouseenter", () => {
    if (tipHideTimer) { clearTimeout(tipHideTimer); tipHideTimer = null; }
  });
  tip.addEventListener("mouseleave", () => {
    // The tooltip takes no pointer events, so this rarely fires -- but if it
    // ever does, the same rule applies: the cursor is off the tooltip.
    if (!tipPointerOverTip()) hideTip();
  });
}

// The server does not know this cultivator: its save file was lost, or it
// is a fresh server. The player still carries the cultivator in their own
// save, so they hand it over once and walk back into the world.
async function adoptPlayer(p) {
  if (!p || !p.username) return false;
  try {
    const r = await fetch("/api/adopt", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: p.username, player: p }),
    });
    const j = await r.json();
    if (j.ok) {
      cEvent("The server had lost this cultivator — your own save was carried back in.");
      return true;
    }
  } catch {}
  return false;
}

// ---------- mail ----------
// Patch notes, the newcomer starter pack, and maintenance rewards.
// The server owns the mailbox: opening mail asks it to mark it read, and only
// claiming ever moves items into the bag. A mail that still carries an
// attachment deliberately stays unread when opened, so the badge keeps
// pointing at it until the player actually claims it.
let mailBox = [], mailOpen = null, mailBusy = false;

function mailUnread() {
  return mailBox.filter(m => !m.read).length;
}

let mailNewItems = 0;

function paintMailBadge() {
  const b = $("mail-badge");
  if (!b) return;
  // New items waiting to be claimed are what the badge is really about;
  // plain patch notes fall back to the unread count.
  const n = mailNewItems > 0 ? mailNewItems : mailUnread();
  b.textContent = n;
  b.hidden = n === 0;
}

function mailDate(sec) {
  const d = new Date((sec || 0) * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function mailItemsHtml(items) {
  const ids = Object.keys(items || {});
  if (!ids.length) return "";
  const total = ids.reduce((a, id) => a + (Number(items[id]) || 0), 0);
  return `<div class="mail-items">${ids.map(id => {
    const it = ITEM_BY_ID[id];
    const rc = ITEM_RARITY_COLORS[(it && it.rarity) || ITEM_DEFAULT_RARITY];
    return `<div class="mail-item"${it ? ` data-tip="${esc(id)}"` : ""}${rc ? ` style="--rc:${rc}"` : ""}>` +
      iconHtml(it && it.img, (it && it.glyph) || "✦", artCls(it, "art-slot")) +
      `<span class="mail-item-name">${esc(it ? it.name : id)}</span>` +
      `<span class="count">x${Number(items[id]) || 0}</span></div>`;
  }).join("")}</div><p class="mail-item-note">${total} item${total === 1 ? "" : "s"} to claim</p>`;
}

function renderMail() {
  const root = $("mail-root");
  if (!root) return;
  hideTip();
  paintMailBadge();
  if (!mailBox.length) {
    root.innerHTML = `<div class="mail-empty"><h2>Mail</h2><p class="muted">The mailbox is empty. Patch notes and rewards arrive here.</p></div>`;
    return;
  }
  const rows = [...mailBox].reverse().map(m => {
    const held = Object.keys(m.items || {}).length > 0 && !m.claimed;
    const cls = m.read ? (m.claimed ? "mail-row done" : "mail-row") : "mail-row unread";
    const tag = m.claimed ? '<span class="mail-tag claimed">Claimed</span>'
      : held ? '<span class="mail-tag held">Unclaimed</span>' : "";
    return `<div class="${cls}${mailOpen === m.id ? " open" : ""}" data-mail="${esc(m.id)}">` +
      `<div class="mail-row-head"><span class="mail-dot" aria-hidden="true"></span>` +
      `<span class="mail-subject">${esc(m.subject)}</span>${tag}</div>` +
      `<div class="mail-meta">${esc(m.kind)} · ${esc(mailDate(m.sent))}</div>` +
      `<div class="mail-body">${esc(m.body).replace(/\n/g, "<br/>")}</div>` +
      mailItemsHtml(m.items) +
      (held ? `<button class="btn gold mail-claim" data-claim="${esc(m.id)}">Claim ${Object.keys(m.items).length} item${Object.keys(m.items).length === 1 ? "" : "s"}</button>`
        : (m.claimed && Object.keys(m.items || {}).length ? '<p class="mail-item-note">Received.</p>' : "")) +
      `</div>`;
  }).join("");
  root.innerHTML = `<div class="mail-panel"><h2>Mail</h2>` +
    `<p class="muted mail-count">${mailBox.length} message${mailBox.length === 1 ? "" : "s"} · ${mailUnread()} unread</p>` +
    `<div class="mail-list">${rows}</div></div>`;

  root.querySelectorAll("[data-claim]").forEach(b => {
    b.onclick = e => { e.stopPropagation(); claimMail(b.dataset.claim); };
  });
  root.querySelectorAll("[data-mail]").forEach(el => {
    el.onmousemove = e => {
      const it = el.querySelector("[data-tip]");
      if (it) showTip(it.dataset.tip, e.clientX, e.clientY);
    };
    el.onmouseleave = hideTip;
    el.onclick = () => openMail(el.dataset.mail);
  });
}

async function loadMail() {
  const p = state.player;
  if (!p) return;
  renderMail();
  try {
    const r = await fetch(`/api/mail?username=${encodeURIComponent(p.username)}`, { cache: "no-store" });
    const j = await r.json();
    if (j.ok && j.mail) {
      mailBox = j.mail;
      mailOpen = null;
      if (typeof j.new_items === "number") mailNewItems = j.new_items;
      renderMail();
    }
  } catch {
    /* offline: keep whatever was last shown */
  }
}

async function openMail(id) {
  const p = state.player;
  if (!p) return;
  mailOpen = id;
  renderMail();
  try {
    const r = await fetch("/api/mail/read", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: p.username, id }),
    });
    const j = await r.json();
    if (j.ok && j.mail) {
      const i = mailBox.findIndex(m => m.id === id);
      if (i >= 0) mailBox[i] = j.mail;
      // held=true means it still carries items: stays unread until claimed.
      if (!j.held) cEvent(`Mail read — ${j.mail.subject}`);
      renderMail();
    }
  } catch {
    /* offline */
  }
}

async function claimMail(id) {
  const p = state.player;
  if (!p || mailBusy) return;
  mailBusy = true;
  try {
    const r = await fetch("/api/mail/claim", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: p.username, id }),
    });
    const j = await r.json();
    if (j.ok) {
      const ids = Object.keys(j.granted || {});
      const i = mailBox.findIndex(m => m.id === id);
      if (i >= 0) mailBox[i] = j.mail;
      if (typeof j.new_items === "number") mailNewItems = j.new_items;
      // Adopt the server's inventory so the bag reflects the grant at once.
      if (j.inventory) p.inventory = j.inventory;
      saveLocal(p);
      renderMail();
      renderInventory();
      const names = ids.map(x => (ITEM_BY_ID[x] ? ITEM_BY_ID[x].name : x)).join(", ");
      cEvent(`Claimed ${names} — in your Bag.`);
    }
  } catch {
    cEvent("Could not reach the server to claim that mail.");
  }
  mailBusy = false;
}

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
    const r = await fetch("/api/health", { cache: "no-store" });
    const j = await r.json();
    if (!String(j.version || "").endsWith(CLIENT_VERSION)) {
      serverAlert(`Server/client version mismatch (server: ${j.version || "unknown"}, client: v${CLIENT_VERSION}). Restart server.py from the latest pull.`);
    }
    applyServerState(j);
  } catch {
    serverAlert("Cannot reach the game server. Start it with: python server.py");
  }
}

// Maintenance mode and the admin announcement banner, both driven from
// /api/health so they appear without the player doing anything.
let serverState = { maintenance: { on: false, message: "" }, announcement: "", restartSeq: 0 };

function applyServerState(j) {
  const prev = serverState;
  serverState = {
    maintenance: j.maintenance || { on: false, message: "" },
    announcement: j.announcement || "",
    restartSeq: j.restart_seq || 0,
  };
  if (serverState.maintenance.on && !prev.maintenance.on) {
    cEvent("The heavens are quiet — the game is down for maintenance.");
  }
  if (serverState.restartSeq !== prev.restartSeq && prev.restartSeq) {
    cEvent("The server restarted. Your progress was reloaded.");
  }
  paintServerBanner();
}

function paintServerBanner() {
  const el = $("server-banner");
  if (!el) return;
  const m = serverState.maintenance;
  const a = serverState.announcement;
  if (m.on) {
    el.textContent = "Under maintenance — " + (m.message || "returning shortly");
    el.className = "server-banner maint";
    el.hidden = false;
    return;
  }
  if (a) {
    el.textContent = a;
    el.className = "server-banner notice";
    el.hidden = false;
    return;
  }
  el.hidden = true;
}

// Poll for admin state so maintenance and announcements land on their own.
// Deliberately not gated on having a save: the username and root screens need
// this too, and that is exactly where a /maintenance notice has to appear
// before anyone can even start playing.
async function pollServerState() {
  if (document.hidden) return; // hidden tabs get throttled; we catch up on show
  try {
    const p = state.player;
    const url = p && p.username
      ? "/api/health?username=" + encodeURIComponent(p.username)
      : "/api/health";
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    // The mail badge is live: new mail shows up without a reload. It is
    // painted before the banner, so a banner problem cannot mute it.
    if (typeof j.mail_new === "number") {
      mailNewItems = j.mail_new;
      paintMailBadge();
    }
    applyServerState(j);
  } catch {}
}

