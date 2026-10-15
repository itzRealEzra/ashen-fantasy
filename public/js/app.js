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

// ---------- main game ----------
function enterMain(p) {
  show("screen-main");
  $("p-name").textContent = p.username;
  $("p-realm").textContent = p.realm;
  $("p-qi").textContent = p.cultivation;
  $("cult-desc").textContent = `${p.username}, your foundation: ${p.roots.map(r=>r.name).join(" + ")} (Qi ×${p.stats.qi_mult}). Meditate to gather qi, then breakthrough.`;
  renderChar(p);
  updateQi(p);
  log($("cult-log"), `— ${p.username} steps onto the cultivation path. Realm: ${p.realm}. —`);
}

function renderChar(p) {
  $("char-sheet").innerHTML = `
    <p><b>${esc(p.username)}</b> · ${esc(p.realm)} · Qi ×${p.stats.qi_mult} · Compr ${p.stats.comprehension} · Phys ${p.stats.physique} · Fort ${p.stats.fortune}</p>` +
    p.roots.map(r => `<div class="char-card" style="border-left-color:${r.color}"><b style="color:${r.color}">${esc(r.name)}</b> <small>${esc(r.rarity)} · ${esc(r.element)}</small><br/>${esc(r.desc)}<br/><small>Qi ×${r.qi_mult} · C${r.comprehension} P${r.physique} F${r.fortune}</small></div>`).join("");
}

function updateQi(p) {
  $("p-qi").textContent = Math.floor(p.cultivation);
  $("qi-bar").style.width = Math.min(100, p.cultivation / p.cultivation_to_next * 100) + "%";
}

$("meditate-btn").onclick = () => {
  const p = state.player;
  const gain = Math.round((8 + Math.random() * 8) * p.stats.qi_mult);
  p.cultivation += gain;
  localStorage.setItem("af_player", JSON.stringify(p));
  updateQi(p);
  log($("cult-log"), `Meditated one cycle… +${gain} qi (×${p.stats.qi_mult}). incense curls.`);
};

$("breakthrough-btn").onclick = () => {
  const p = state.player;
  if (p.cultivation < p.cultivation_to_next) {
    log($("cult-log"), `Bottleneck holds. Need ${p.cultivation_to_next - Math.floor(p.cultivation)} more qi. Fortune ${p.stats.fortune} watches.`);
    return;
  }
  const luck = Math.random() * 10 + p.stats.fortune * 0.4;
  if (luck > 7) {
    p.cultivation = 0; p.cultivation_to_next = Math.round(p.cultivation_to_next * 1.6);
    p.realm = nextRealm(p.realm);
    $("p-realm").textContent = p.realm;
    log($("cult-log"), `⚡ TRIBULATION PASSED! Realm rises: ${p.realm}. Heavenly thunder bows.`);
  } else {
    p.cultivation = Math.floor(p.cultivation * 0.5);
    log($("cult-log"), `☠ Breakthrough failed — qi deviates! Half your qi disperses. Meditate and try again.`);
  }
  localStorage.setItem("af_player", JSON.stringify(p));
  updateQi(p);
};

function nextRealm(r) {
  const order = ["Qi Refining I","Qi Refining II","Qi Refining III","Foundation I","Foundation II","Foundation III","Golden Core I"];
  const i = order.indexOf(r);
  return order[Math.min(order.length-1, i+1)];
}

document.querySelectorAll(".side-btn").forEach(b => b.onclick = () => {
  document.querySelectorAll(".side-btn").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $("tab-" + b.dataset.tab).classList.add("active");
  if (window.innerWidth < 900) $("sidebar").classList.remove("open");
});
$("hamburger").onclick = () => $("sidebar").classList.toggle("open");

$("battle-btn").onclick = () => {
  const p = state.player;
  const power = p.stats.physique * 6 + p.stats.comprehension * 4 + Math.random() * 20;
  const foe = 60 + Math.random() * 40;
  log($("battle-log"), power > foe
    ? `⚔ Victory! (${Math.round(power)} vs puppet ${Math.round(foe)}) Your ${esc(p.roots[0].name)} flares. +15 qi insight.`
    : `✖ Defeated… (${Math.round(power)} vs puppet ${Math.round(foe)}) The puppet's stone fist teaches humility. Meditate more.`);
  if (power > foe) { p.cultivation += 15; localStorage.setItem("af_player", JSON.stringify(p)); updateQi(p); }
};

// boot
if (state.username) $("username-input").value = state.username;
