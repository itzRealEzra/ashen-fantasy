/* Ashen Fantasy — vanilla JS state machine: username -> roots -> main */
const $ = (id) => document.getElementById(id);
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
  btn.textContent = "REROLL 【 Roll Again 】";
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
let tickTimer = null, syncTimer = null, lastTick = 0, medCdUntil = 0;
let stageFlags = { half: false, full: false };
const TABID = Math.random().toString(36).slice(2);
const OFFLINE_CAP_SEC = 8 * 3600, OFFLINE_EFF = 0.5;

function fallbackRealms() {
  // Mirrors the server ladder: Mortal (major) + Qi Refinement I-X, 10 layers each.
  const specs = [{ realm: "Mortal", layer: 0, major: true, bottleneck_req: 0,
    flavor: "A mortal body of flesh and bone. Endure the tribulation and step onto the Dao." }];
  for (const r of ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"])
    for (let layer = 1; layer <= 10; layer++) {
      const last = r === "X" && layer === 10;
      specs.push({ realm: `Qi Refinement ${r}`, layer, major: false,
        bottleneck_req: layer === 10 && !last ? 1 : 0, flavor: "" });
    }
  return specs.map((s, i) => ({
    idx: i, name: s.layer === 0 ? s.realm : `${s.realm} · Layer ${s.layer}`,
    realm: s.realm, layer: s.layer,
    cost: Math.round(50 * Math.pow(1.06, i)),
    rate_mult: Math.round((1 + 0.12 * i) * 100) / 100,
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
  return 1.0 * p.stats.qi_mult * st.rate_mult * (p.seclusion ? 2 : 1);
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
  p.seclusion = !!p.seclusion;
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
      if (!quiet) log($("cult-log"), `✦ Excess qi condenses into Dao Insight (${p.dao_insight}).`);
    }
  } else if (!quiet) {
    const frac = p.cultivation / st.cost;
    if (frac >= 0.5 && !stageFlags.half) {
      stageFlags.half = true;
      log($("cult-log"), "Your qi churns at half-full. The bottleneck trembles…");
    }
    if (frac >= 1 && !stageFlags.full) {
      stageFlags.full = true;
      log($("cult-log"), "Qi brims over! Attempt a BREAKTHROUGH.");
    }
  }
  updateQi(p);
}

function fmtDur(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function etaText(p) {
  const st = stageOf(p), rate = cultRate(p);
  const need = st.cost - p.cultivation;
  if (st.cap) return p.dao_insight > 0
    ? `${p.dao_insight} Dao Insight condensed — the ladder ends here (for now)`
    : "Peak of the ladder — excess qi becomes Dao Insight";
  if (st.bottleneck_req > 0 && p.bottleneck < st.bottleneck_req)
    return `Bottleneck insight ${p.bottleneck}/${st.bottleneck_req} · ` +
      (need > 0 ? fmtDur(need / rate) + " of qi to brim" : "bar full — grind or break through");
  if (need > 0) return `≈ ${fmtDur(need / rate)} to breakthrough`;
  return `Ready — BREAKTHROUGH! (+${Math.floor(-need)} surplus carries over)`;
}

function refreshCultPanel() {
  const p = state.player;
  if (!p || !REALM_TABLE.length) return;
  const st = stageOf(p), rate = cultRate(p);
  p.cultivation_to_next = st.cost;
  $("p-realm").textContent = p.realm;
  $("cult-desc").textContent = `${p.username}, your foundation: ${p.roots.map(r => r.name).join(" + ")} ` +
    `(root ×${p.stats.qi_mult}, realm ×${st.rate_mult}${p.seclusion ? ", seclusion ×2" : ""}). ${st.flavor}`;
  $("cult-rate").textContent = `+${rate.toFixed(2)} Qi/s${p.seclusion ? " — SECLUSION ×2" : ""}`;
  $("cult-eta").textContent = etaText(p);
  const sb = $("seclusion-btn");
  sb.textContent = p.seclusion ? "⛰ Emerge from Seclusion" : "⛰ Enter Seclusion (×2 Qi)";
  sb.classList.toggle("seclusion-on", !!p.seclusion);
  $("battle-btn").disabled = !!p.seclusion;
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
  $("welcome-back").style.display = "none";
  if (elapsed > 60) {
    const gain = cultRate(p) * Math.min(elapsed, OFFLINE_CAP_SEC) * OFFLINE_EFF;
    accrue(p, gain, true);
    const h = Math.floor(elapsed / 3600), m = Math.floor((elapsed % 3600) / 60);
    $("welcome-back").style.display = "block";
    $("welcome-back").textContent =
      `Welcome back, ${p.username}. ${h}h ${m}m away — passive circulation gained +${Math.floor(gain)} Qi (50% efficiency).`;
    log($("cult-log"), `— ${p.username} returns after ${h}h ${m}m. +${Math.floor(gain)} Qi gathered in absence. —`);
  } else {
    log($("cult-log"), `— ${p.username} steps onto the cultivation path. Realm: ${p.realm}. —`);
  }
  refreshCultPanel();
  updateQi(p);
  saveLocal(p);
  startTick();
  syncPlayer(true);
}

function renderChar(p) {
  if (!REALM_TABLE.length) return;
  const st = stageOf(p);
  $("char-sheet").innerHTML =
    `<p><b>${esc(p.username)}</b> · ${esc(p.realm)} · Qi ×${p.stats.qi_mult} · Compr ${p.stats.comprehension} · Phys ${p.stats.physique} · Fort ${p.stats.fortune} · 💠 Dao Insight ×${p.dao_insight}${p.seclusion ? " · ⛰ Secluded" : ""}</p>` +
    `<p class="muted">${esc(st.flavor)}</p>` +
    p.roots.map(r => `<div class="char-card" style="border-left-color:${r.color}"><b style="color:${r.color}">${esc(r.name)}</b> <small>${esc(r.rarity)} · ${esc(r.element)}</small><br/>${esc(r.desc)}<br/><small>Qi ×${r.qi_mult} · C${r.comprehension} P${r.physique} F${r.fortune}</small></div>`).join("");
}

function updateQi(p) {
  $("p-name").textContent = p.username;
  $("p-qi").textContent = Math.floor(p.cultivation);
  $("qi-bar").style.width = Math.min(100, p.cultivation / p.cultivation_to_next * 100) + "%";
  if ($("cult-eta")) $("cult-eta").textContent = REALM_TABLE.length ? etaText(p) : "";
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
        $("p-realm").textContent = p.realm;
      }
      if (j.clamped && !initial)
        log($("cult-log"), "Heaven corrects your meridians — reported qi exceeded honest gains. (clamped)");
      renderChar(p);
      refreshCultPanel();
      updateQi(p);
      saveLocal(p);
    }
  } catch {
    if (initial) log($("cult-log"), "Heaven is silent (server unreachable) — cultivating locally.");
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

$("meditate-btn").onclick = () => {
  const p = state.player;
  const now = Date.now();
  if (now < medCdUntil || !p) return;
  medCdUntil = now + 5000;
  const btn = $("meditate-btn");
  btn.disabled = true;
  const iv = setInterval(() => {
    const left = Math.ceil((medCdUntil - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(iv);
      btn.disabled = false;
      btn.textContent = "🧘 Meditate (+Qi)";
    } else btn.textContent = `🧘 Meditate (${left}s)`;
  }, 250);
  const gain = Math.round((8 + Math.random() * 8) * p.stats.qi_mult);
  accrue(p, gain);
  saveLocal(p);
  log($("cult-log"), `Meditated one cycle… +${gain} qi (×${p.stats.qi_mult}). incense curls.`);
};

$("seclusion-btn").onclick = () => {
  const p = state.player;
  if (!p) return;
  p.seclusion = !p.seclusion;
  log($("cult-log"), p.seclusion
    ? "⛰ You seal the cave mouth. Seclusion begins — Qi flows twice as fast, but battle is forbidden."
    : "⛰ You emerge from seclusion, dusting off your robes.");
  saveLocal(p);
  refreshCultPanel();
  syncPlayer(false);
};

$("breakthrough-btn").onclick = () => {
  const p = state.player;
  if (!p) return;
  const st = stageOf(p);
  if (st.cap) {
    if (p.cultivation < st.cost) {
      log($("cult-log"), `Peak unmoved. Need ${st.cost - Math.floor(p.cultivation)} more qi to condense insight.`);
      return;
    }
    p.cultivation -= st.cost;
    p.dao_insight++;
    log($("cult-log"), `💠 A full bar of peak-stage qi collapses into Dao Insight (${p.dao_insight}). The heavens take note.`);
    saveLocal(p);
    refreshCultPanel();
    updateQi(p);
    syncPlayer(false);
    return;
  }
  if (p.cultivation < p.cultivation_to_next) {
    log($("cult-log"), `Bottleneck holds. Need ${p.cultivation_to_next - Math.floor(p.cultivation)} more qi. Fortune ${p.stats.fortune} watches.`);
    return;
  }
  // bottleneck grinding: insight attempts cost 25% qi each
  if (p.bottleneck < st.bottleneck_req) {
    p.bottleneck++;
    p.cultivation = Math.floor(p.cultivation * 0.75);
    log($("cult-log"), p.bottleneck >= st.bottleneck_req
      ? `💥 Bottleneck SHATTERED! Insight ${p.bottleneck}/${st.bottleneck_req} — attempt the breakthrough again!`
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
    for (const [nm, stat] of trials) {
      const roll = Math.random() * 10 + stat * 0.12;
      if (roll > 6.5) {
        endured++;
        log($("cult-log"), `  ✓ ${nm} endured (heaven roll ${roll.toFixed(1)}).`);
      } else log($("cult-log"), `  ✗ ${nm} overwhelms you (heaven roll ${roll.toFixed(1)}).`);
    }
    if (endured >= 2) {
      advanceRealm(p, `⚡ TRIBULATION PASSED (${endured}/3)! Realm rises. Heavenly thunder bows.`);
    } else {
      const loss = 0.25 + Math.random() * 0.25;
      p.cultivation = Math.floor(p.cultivation * (1 - loss));
      log($("cult-log"), `☠ Tribulation failed (${endured}/3) — ${Math.round(loss * 100)}% of qi disperses. Your insight remains; temper yourself and return.`);
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
    log($("cult-log"), "☠ Breakthrough failed — qi deviates! Half your qi disperses. Meditate and try again.");
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
  $("p-realm").textContent = p.realm;
  log($("cult-log"), `${msg} Realm rises: ${p.realm}. ${st.flavor}`);
  saveLocal(p);
  renderChar(p);
  refreshCultPanel();
  updateQi(p);
  syncPlayer(false);
}

document.querySelectorAll(".side-btn").forEach(b => b.onclick = () => {
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

$("battle-btn").onclick = () => {
  const p = state.player;
  if (p.seclusion) {
    log($("battle-log"), "⛰ You are in closed-door seclusion. Emerge before seeking battle.");
    return;
  }
  const power = p.stats.physique * 6 + p.stats.comprehension * 4 + Math.random() * 20;
  const foe = 60 + Math.random() * 40;
  log($("battle-log"), power > foe
    ? `⚔ Victory! (${Math.round(power)} vs puppet ${Math.round(foe)}) Your ${esc(p.roots[0].name)} flares. +15 qi insight.`
    : `✖ Defeated… (${Math.round(power)} vs puppet ${Math.round(foe)}) The puppet's stone fist teaches humility. Meditate more.`);
  if (power > foe) { accrue(p, 15); saveLocal(p); }
};

// boot
if (state.username) $("username-input").value = state.username;
