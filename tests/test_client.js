/* Ashen Fantasy client regression tests (node, no packages).
 * Extracts real functions from public/js/app.js and drives them with
 * DOM/browser stubs. Run: node tests/test_client.js */
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "public", "js", "app.js"), "utf8");
function grab(re, name) {
  const m = SRC.match(re);
  if (!m) throw new Error("missing extract: " + name);
  return m[0];
}

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("PASS  " + label); }
  else { fail++; console.log("FAIL  " + label); }
}

// ---------- fixtures ----------
const mkEl = () => ({
  innerHTML: "", textContent: "", style: {}, onclick: null,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  querySelectorAll: () => [],
});
const els = {
  "breakthrough-btn": mkEl(), "p-name": mkEl(), "qi-bar": mkEl(),
  "char-sheet": mkEl(), "p-realm": mkEl(), "cult-rate": mkEl(),
  "battle-root": mkEl(), "char-hp": mkEl(), "char-qi": mkEl(),
};
const calls = { cEvents: [], saves: [], enemies: [], notices: [], renderInv: 0, timeouts: [], fetch: null };
const state = { username: "tester", player: null };

const ZERO_STATS = { atk: 0, def: 0, hp: 0, crit: 0, critDmg: 0 };
const ITEM_FIXTURE = {
  healing_pill: { id: "healing_pill", name: "Healing Pill", kind: "consumable", slot: null, glyph: "💊", rarity: "Earth", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 40, qi_pct: 0 } },
  qi_pill: { id: "qi_pill", name: "Qi Pill", kind: "consumable", slot: null, glyph: "🔮", rarity: "Earth", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 0, qi_pct: 15 } },
  spirit_meal: { id: "spirit_meal", name: "Spirit Meal", kind: "consumable", slot: null, glyph: "🍱", rarity: "Earth", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 15, qi_pct: 5 } },
  linen_robe: { id: "linen_robe", name: "Linen Robe", kind: "gear", slot: "chest", glyph: "🥋", rarity: "Mortal", desc: "", stats: { ...ZERO_STATS, def: 4, hp: 30 } },
  copper_ring: { id: "copper_ring", name: "Copper Ring", kind: "gear", slot: "ring", glyph: "⭕", rarity: "Mortal", desc: "", stats: { ...ZERO_STATS, crit: 2 } },
  cinder: { id: "cinder", name: "Cinder", kind: "material", slot: null, glyph: "✦", rarity: "Mortal", desc: "", stats: { ...ZERO_STATS } },
};
const mkRealm = (idx, o) => ({
  idx, name: o.name || ("R" + idx), realm: o.name || ("R" + idx), layer: 0,
  cost: o.cost, rate_mult: 1, major: !!o.major,
  bottleneck_req: o.bottleneck_req || 0, flavor: "", cap: !!o.cap,
});
const REALMS_FIXTURE = [
  mkRealm(0, { name: "Mortal", cost: 50, major: true }),
  mkRealm(1, { name: "QR I", cost: 80 }),
  mkRealm(2, { name: "QR II", cost: 128 }),
  mkRealm(3, { name: "QR III", cost: 205 }),
  mkRealm(4, { name: "QR IV", cost: 328 }),
  mkRealm(5, { name: "QR V", cost: 524 }),
  mkRealm(6, { name: "QR VI", cost: 839, bottleneck_req: 1 }),
  mkRealm(7, { name: "QR X", cost: 1342, cap: true }),
];

// ---------- harness ----------
const parts = [
  grab(/const EQUIP_SLOT_LIST = \[[\s\S]*?\];/, "EQUIP_SLOT_LIST"),
  grab(/const battle = \{[\s\S]*?\};/, "battle"),
  grab(/function stageOf\(p\) \{[\s\S]*?\n\}/, "stageOf"),
  grab(/function cultRate\(p\) \{[\s\S]*?\n\}/, "cultRate"),
  grab(/function breakthroughReady\(p\) \{[\s\S]*?\n\}/, "breakthroughReady"),
  grab(/function updateQi\(p\) \{[\s\S]*?\n\}/, "updateQi"),
  grab(/function refreshCultPanel\(\) \{[\s\S]*?\n\}/, "refreshCultPanel"),
  grab(/function accrue\(p, amt, quiet\) \{[\s\S]*?\n\}/, "accrue"),
  grab(/function renderChar\(p\) \{[\s\S]*?\n\}/, "renderChar"),
  grab(/function advanceRealm\(p, msg\) \{[\s\S]*?\n\}/, "advanceRealm"),
  grab(/function normalizePlayer\(p\) \{[\s\S]*?\n\}/, "normalizePlayer"),
  grab(/function clampHp\(p\) \{[\s\S]*?\n\}/, "clampHp"),
  grab(/function lootKey\(\) \{[^}]*\}/, "lootKey"),
  grab(/function saveLoot\(\) \{[\s\S]*?\n\}/, "saveLoot"),
  grab(/function clearLootLog\(\) \{[\s\S]*?\n\}/, "clearLootLog"),
  grab(/async function fetchServerPlayer\(username\) \{[\s\S]*?\n\}/, "fetchServerPlayer"),
  grab(/async function syncPlayer\(initial\) \{[\s\S]*?\n\}/, "syncPlayer"),
  grab(/function derivedStats\(p\) \{[\s\S]*?\n\}/, "derivedStats"),
  grab(/function gearBonus\(p\) \{[\s\S]*?\n\}/, "gearBonus"),
  grab(/function playerMaxHp\(p\) \{ return derivedStats\(p\)\.hp; \}/, "playerMaxHp"),
  grab(/function equipTargets\(it\) \{[^}]*\}/, "equipTargets"),
  grab(/function bagGearAction\(itemId\) \{[\s\S]*?\n\}/, "bagGearAction"),
  grab(/function equipItem\(itemId\) \{[\s\S]*?\n\}/, "equipItem"),
  grab(/function unequipSlot\(slot\) \{[\s\S]*?\n\}/, "unequipSlot"),
  grab(/function afterGearChange\(before\) \{[\s\S]*?\n\}/, "afterGearChange"),
  grab(/function useConsumable\(itemId\) \{[\s\S]*?\n\}/, "useConsumable"),
  grab(/function elixirPreferredSlot\(it\) \{[\s\S]*?\n\}/, "elixirPreferredSlot"),
  grab(/function loadElixirSlot\(itemId\) \{[\s\S]*?\n\}/, "loadElixirSlot"),
  grab(/function unloadElixir\(itemId\) \{[\s\S]*?\n\}/, "unloadElixir"),
  grab(/function useElixir\(i\) \{[\s\S]*?\n\}/, "useElixir"),
  grab(/function stopBattle\(\) \{[\s\S]*?\n\}/, "stopBattle"),
  grab(/function persistBattleHp\(fainted\) \{[\s\S]*?\n\}/, "persistBattleHp"),
  grab(/function leaveActiveHunt\(\) \{[\s\S]*?\n\}/, "leaveActiveHunt"),
  grab(/function showBattleAreas\(\) \{[\s\S]*?\n\}/, "showBattleAreas"),
  grab(/function setBar\(id, frac, attack\) \{[\s\S]*?\n\}/, "setBar"),
  grab(/function paintBars\(\) \{[\s\S]*?\n\}/, "paintBars"),
  grab(/function paintCombat\(\) \{[\s\S]*?\n\}/, "paintCombat"),
  grab(/function flash\(id\) \{[\s\S]*?\n\}/, "flash"),
  grab(/function strikeDmg\(atk, crit, critDmg, dfn\) \{[\s\S]*?\n\}/, "strikeDmg"),
  grab(/function battleTick\(\) \{[\s\S]*?\n\}/, "battleTick"),
  grab(/function onMobDeath\(\) \{[\s\S]*?\n\}/, "onMobDeath"),
  grab(/function onPlayerDeath\(\) \{[\s\S]*?\n\}/, "onPlayerDeath"),
  grab(/function addInv\(id, n\) \{[\s\S]*?\n\}/, "addInv"),
  grab(/function takeInv\(id, n\) \{[\s\S]*?\n\}/, "takeInv"),
  grab(/\$\("breakthrough-btn"\)\.onclick = \(\) => \{[\s\S]*?\n\};/, "breakthrough-click"),
].join("\n");

const prelude = `
  const { state, els, calls, ITEM_FIXTURE, REALMS_FIXTURE } = __;
  let REALM_TABLE = REALMS_FIXTURE;
  let ITEM_BY_ID = ITEM_FIXTURE;
  let NAME_TO_ID = {};
  for (const id of Object.keys(ITEM_BY_ID)) NAME_TO_ID[ITEM_BY_ID[id].name] = id;
  let syncing = false;
  let stageFlags = { half: false, full: false };
  const $ = id => (id in els ? els[id] : null);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cEvent = msg => calls.cEvents.push(msg);
  const saveLocal = p => calls.saves.push(p);
  const renderInventory = () => { calls.renderInv++; };
  const notifyStatChange = (b, a) => calls.notices.push([b, a]);
  const showBattleEnemies = msg => calls.enemies.push(msg);
  const setTimeout = (fn, ms) => { calls.timeouts.push({ fn, ms }); return calls.timeouts.length; };
  const fetch = (...a) => (calls.fetch ? calls.fetch(...a) : Promise.resolve({ ok: false, json: async () => ({ ok: false }) }));
`;

const lib = new Function("__", prelude + parts + `
  return {
    battle, calls,
    setRealms: t => { REALM_TABLE = t; },
    syncPlayer, fetchServerPlayer, normalizePlayer, breakthroughReady, updateQi,
    advanceRealm, accrue, equipItem, unequipSlot, bagGearAction, useConsumable,
    loadElixirSlot, unloadElixir, elixirPreferredSlot, leaveActiveHunt,
    showBattleAreas, battleTick, derivedStats, playerMaxHp, addInv, takeInv,
    clickBreakthrough: () => els["breakthrough-btn"].onclick(),
  };
`)({ state, els, calls, ITEM_FIXTURE, REALMS_FIXTURE });

// derivedStats max HP for basePlayer (physique 5, realm 0): 100 + 5*25 = 225.
const MAXHP = 225;
const basePlayer = () => ({
  username: "tester", hp: MAXHP, realm_idx: 0, realm: "Mortal",
  cultivation: 0, cultivation_to_next: 50, bottleneck: 0, dao_insight: 0,
  seclusion: false, last_seen: Date.now() / 1000,
  stats: { qi_mult: 1, comprehension: 5, physique: 5, fortune: 5, synergy_bonus: 0 },
  roots: [{ name: "Test Root", rarity: "Mortal", element: "Earth", color: "#9aa0a6", desc: "d" }],
  equipment: { head: null, sec_weapon: null, chest: null, main_weapon: null, core: null,
    arm: null, back: null, boots: null, legs: null, ring1: null, ring2: null,
    necklace: null, headpiece: null },
  inventory: {}, elixirs: [null, null, null],
});
state.player = basePlayer();

// ============ 1. sync never clobbers client HP ============
(async () => {
  state.player = basePlayer();
  calls.fetch = async () => ({ ok: true, json: async () => ({ ok: true, clamped: false, player: { username: "tester", hp: null, cultivation: 5, realm_idx: 0, bottleneck: 0, dao_insight: 0, seclusion: false, equipment: {}, inventory: {}, elixirs: [null, null, null], roots: [], stats: state.player.stats, last_seen: Date.now() / 1000 } }) });
  await lib.syncPlayer(true);
  ok(state.player.hp === MAXHP, "sync ignores server hp:null (keeps client hp)");
  calls.fetch = null;

  // ============ 2. qi bar / breakthrough button read live stage cost ============
  lib.setRealms([mkRealm(0, { name: "Mortal", cost: 29000, major: true })]);
  state.player = basePlayer();
  state.player.cultivation = 29000;
  state.player.cultivation_to_next = 999999; // stale cache
  lib.updateQi(state.player);
  ok(els["qi-bar"].style.width === "100%", "qi bar full from live cost despite stale cache");
  ok(state.player.cultivation_to_next === 29000, "cultivation_to_next repaired to live cost");
  ok(lib.breakthroughReady({ cultivation: 29000, realm_idx: 0 }) === true, "breakthrough ready at full qi (unmet bottleneck)");
  ok(lib.breakthroughReady({ cultivation: 28999, realm_idx: 0 }) === false, "breakthrough hidden below cost");

  // ============ 3. restore-safe normalize: legacy 4-slot elixirs re-home to 3 ============
  lib.setRealms(REALMS_FIXTURE);
  let p = basePlayer();
  p.elixirs = ["healing_pill", "healing_pill", "qi_pill", "spirit_meal"]; // legacy + dup
  p.inventory = { healing_pill: 2, qi_pill: 1, spirit_meal: 1, bogus_item: 5 };
  p.equipment.head = "linen_robe"; // wrong slot (chest item) -> cleared
  p.realm_idx = 0;
  lib.normalizePlayer(p);
  ok(JSON.stringify(p.elixirs) === JSON.stringify(["healing_pill", "qi_pill", "spirit_meal"]),
    "legacy 4-slot elixirs dedup + re-home into 3 named slots");
  ok(p.equipment.head === null, "wrong-slot equipped item cleared on normalize");
  ok(p.equipment.chest === "linen_robe", "wrong-slot gear re-homes to its real slot");
  ok(!("bogus_item" in p.inventory), "unknown inventory item dropped");

  p = basePlayer();
  p.elixirs = [null, null, null, "qi_pill"]; // pill stranded in old slot 4
  p.stats = undefined; p.roots = undefined;
  lib.normalizePlayer(p);
  ok(p.elixirs[1] === "qi_pill" && p.elixirs.length === 3, "stranded pill re-homed; missing stats/roots defaulted");
  ok(p.stats && p.stats.qi_mult === 1 && Array.isArray(p.roots), "restore-safe stats/roots defaults");

  ok(lib.elixirPreferredSlot(ITEM_FIXTURE.healing_pill) === 0, "healing pill -> slot 0");
  ok(lib.elixirPreferredSlot(ITEM_FIXTURE.qi_pill) === 1, "qi pill -> slot 1");
  ok(lib.elixirPreferredSlot(ITEM_FIXTURE.spirit_meal) === 2, "spirit meal -> slot 2");

  // ============ 4. equipment / inventory counts / rings ============
  state.player = basePlayer();
  state.player.inventory = { linen_robe: 1 };
  const before = lib.derivedStats(state.player);
  lib.equipItem("linen_robe");
  ok(state.player.equipment.chest === "linen_robe" && state.player.inventory.linen_robe === undefined,
    "equip moves item bag -> slot");
  ok(lib.derivedStats(state.player).def === before.def + 4, "equipment def bonus applied to derived stats");
  lib.unequipSlot("chest");
  ok(state.player.equipment.chest === null && state.player.inventory.linen_robe === 1,
    "unequip returns item to bag");

  state.player = basePlayer();
  state.player.inventory = { copper_ring: 3 };
  lib.equipItem("copper_ring");
  lib.equipItem("copper_ring");
  ok(state.player.equipment.ring1 === "copper_ring" && state.player.equipment.ring2 === "copper_ring",
    "two rings fill both ring slots");
  ok(JSON.stringify(lib.bagGearAction("copper_ring")) === JSON.stringify({ act: "unequip", slot: "ring1" }),
    "bag action unequip when both fingers full");
  ok(state.player.inventory.copper_ring === 1, "ring stack consumed on wear");

  // ============ 5. consumables never wasted ============
  state.player = basePlayer();
  state.player.hp = MAXHP; // full
  state.player.inventory = { healing_pill: 1 };
  lib.useConsumable("healing_pill");
  ok(state.player.inventory.healing_pill === 1 && state.player.hp === MAXHP,
    "healing pill at full HP is not consumed");

  state.player.hp = 100;
  lib.useConsumable("healing_pill");
  ok(Math.round(state.player.hp) === Math.round(100 + MAXHP * 0.4), "healing pill heals 40% when hurt");
  ok(!state.player.inventory.healing_pill, "consumed pill removed from bag");

  state.player = basePlayer();
  state.player.inventory = { qi_pill: 1 };
  state.player.cultivation = 0;
  lib.useConsumable("qi_pill");
  ok(Math.abs(state.player.cultivation - 50 * 0.15) < 1e-9, "qi pill grants 15% of stage qi");

  state.player = basePlayer();
  state.player.hp = MAXHP;
  state.player.inventory = { spirit_meal: 1 };
  lib.useConsumable("spirit_meal");
  ok(Math.abs(state.player.cultivation - 50 * 0.05) < 1e-9 && !state.player.inventory.spirit_meal,
    "spirit meal at full HP still grants its qi and is consumed");

  // ============ 6. combat loop: kill, loot, qi, hp mirror, respawn guard ============
  lib.setRealms(REALMS_FIXTURE);
  state.player = basePlayer();
  const mob = { id: "ash_rat", name: "Ash Rat", hp: 35, atk: 4, def: 0, crit: 5, crit_dmg: 150,
    speed: 0.9, qi: 3, loot: [{ item: "Cinder", chance: 1, min: 1, max: 1 }] };
  lib.battle.view = "combat";
  lib.battle.area = { id: "misty_valley", name: "Misty Mortal Valley", mobs: [mob], req_idx: 0, req: "Mortal", difficulty: "Easy", desc: "" };
  lib.battle.mob = mob;
  lib.battle.php = MAXHP;
  lib.battle.ehp = 35;
  lib.battle.pbar = 0.95;
  lib.battle.ebar = 0;
  lib.battle.searching = false;
  lib.battle.kills = 0;
  lib.battle.loot = {};
  lib.battle.lastQi = 0;
  let ticks = 0;
  while (!lib.battle.searching && ticks < 100) { lib.battleTick(); ticks++; }
  ok(lib.battle.searching, "enemy slain within 10s of combat (" + ticks + " ticks)");
  ok(state.player.inventory.cinder >= 1, "drop landed in the bag exactly once");
  ok(lib.battle.loot.Cinder >= 1, "drop recorded in the loot log");
  ok(Math.abs(state.player.cultivation - 3) < 1e-9, "kill granted the mob's qi reward");
  ok(state.player.hp === lib.battle.php && state.player.hp < MAXHP, "combat damage mirrored into the save every strike");
  ok(calls.timeouts.length >= 1, "respawn timer scheduled");
  ok(lib.battle.lastQi === 3, "qi reward staged for combat feedback");

  // stale respawn must not heal a fresh fight
  const stale = calls.timeouts[calls.timeouts.length - 1];
  lib.battle.searching = false;   // player re-entered combat (startCombat)
  lib.battle.ehp = 20;            // new fight already in progress
  stale.fn();
  ok(lib.battle.ehp === 20, "stale respawn timer does not heal the new fight");
  lib.battle.searching = true;
  stale.fn();
  ok(lib.battle.ehp === 35 && lib.battle.searching === false, "live respawn restores full enemy HP");

  // defeat: full revive, log cleared, items kept
  lib.battle.view = "combat";
  lib.battle.searching = false;
  lib.battle.php = 0;
  lib.battle.mob = mob;
  lib.battle.loot = { Cinder: 1 };
  state.player.hp = 50;
  lib.battleTick();
  ok(calls.enemies.length && /defeated by Ash Rat/.test(calls.enemies[calls.enemies.length - 1]), "defeat shows the killer's name");
  ok(state.player.hp === lib.playerMaxHp(state.player), "defeat revives at full HP");
  ok(lib.battle.mob === null && JSON.stringify(lib.battle.loot) === "{}", "defeat clears mob and loot log");
  ok(state.player.inventory.cinder >= 1, "items already collected survive defeat");

  // zero-HP survivor falls before trading blows
  lib.battle.view = "combat";
  lib.battle.searching = false;
  lib.battle.php = -5;
  lib.battle.ehp = 35;
  lib.battle.mob = mob;
  lib.battle.pbar = 0.99;
  calls.enemies.length = 0;
  lib.battleTick();
  ok(calls.enemies.length === 1 && lib.battle.ehp === 35, "0-HP player dies without dealing another blow");

  // ============ 7. leaving the hunt persists HP, stops fight, clears log ============
  state.player = basePlayer();
  state.player.hp = MAXHP;
  lib.battle.timer = setInterval(() => {}, 10000);
  lib.battle.view = "combat";
  lib.battle.mob = mob;
  lib.battle.php = 150; // hurt mid-fight, below the 225 max
  lib.battle.loot = { Cinder: 2 };
  lib.leaveActiveHunt();
  ok(lib.battle.timer === null, "leaving stops the combat timer");
  ok(state.player.hp === 150, "leaving persists current fight HP");
  ok(lib.battle.mob === null && JSON.stringify(lib.battle.loot) === "{}", "leaving clears mob and loot log");
  ok(lib.battle.view === "areas" && /Choose hunting grounds/.test(els["battle-root"].innerHTML), "leaving lands on the area list");

  // ============ 8. area realm locks ============
  lib.battle.areas = [
    { id: "valley", name: "Valley", desc: "", req_idx: 0, req: "Mortal", difficulty: "Easy", mobs: [] },
    { id: "peaks", name: "Peaks", desc: "", req_idx: 8, req: "QR VIII", difficulty: "Brutal", mobs: [] },
  ];
  state.player = basePlayer();
  state.player.realm_idx = 0;
  lib.showBattleAreas();
  ok(/class="area-row" data-area="valley"/.test(els["battle-root"].innerHTML) &&
     /class="area-row locked" data-area="peaks"/.test(els["battle-root"].innerHTML),
    "realm 0: valley open, peaks locked");
  state.player.realm_idx = 8;
  lib.showBattleAreas();
  ok(!/data-area="peaks"/.test(els["battle-root"].innerHTML.replace(/class="area-row" data-area="peaks"/, "")) ||
     /class="area-row" data-area="peaks"/.test(els["battle-root"].innerHTML),
    "realm 8: peaks unlocked");
  ok(!/area-row locked/.test(els["battle-root"].innerHTML), "no locks remain at realm 8");

  // ============ 9. cultivation: breakthrough grind, condense, carryover ============
  lib.setRealms(REALMS_FIXTURE);
  state.player = basePlayer();
  state.player.realm_idx = 0;
  state.player.cultivation = 30;
  calls.cEvents.length = 0;
  lib.clickBreakthrough();
  ok(/Bottleneck holds\. Need 20 more qi/.test(calls.cEvents[calls.cEvents.length - 1]), "breakthrough below cost explains the deficit");
  ok(state.player.cultivation === 30, "no qi lost when breakthrough is refused");

  // bottleneck grind at QR VI
  state.player = basePlayer();
  state.player.realm_idx = 6;
  state.player.cultivation = REALMS_FIXTURE[6].cost;
  state.player.bottleneck = 0;
  calls.cEvents.length = 0;
  lib.clickBreakthrough();
  ok(state.player.bottleneck === 1, "bottleneck attempt grants insight");
  ok(state.player.cultivation === Math.floor(REALMS_FIXTURE[6].cost * 0.75), "grind spends exactly 25% qi");
  ok(/Bottleneck shattered/.test(calls.cEvents[calls.cEvents.length - 1]), "grind completion reported");

  // peak condense
  state.player = basePlayer();
  state.player.realm_idx = 7;
  state.player.cultivation = REALMS_FIXTURE[7].cost + 5;
  state.player.dao_insight = 0;
  calls.cEvents.length = 0;
  lib.clickBreakthrough();
  ok(state.player.cultivation === 5 && state.player.dao_insight === 1, "peak bar condenses into Dao Insight");

  // deterministic success (fortune 9999 always passes the luck roll)
  state.player = basePlayer();
  state.player.realm_idx = 1;
  state.player.stats.fortune = 9999;
  state.player.cultivation = REALMS_FIXTURE[1].cost + 30;
  lib.clickBreakthrough();
  ok(state.player.realm_idx === 2, "breakthrough advances the realm");
  ok(state.player.cultivation === 30, "surplus qi carries into the next stage");
  ok(state.player.bottleneck === 0, "bottleneck resets on advance");

  // advanceRealm directly (pure carryover math)
  state.player = basePlayer();
  state.player.realm_idx = 1;
  state.player.cultivation = REALMS_FIXTURE[1].cost + 77;
  lib.advanceRealm(state.player, "test");
  ok(state.player.realm_idx === 2 && state.player.cultivation === 77, "advanceRealm consumes only the stage cost");

  // ============ 10. server restore fetch ============
  calls.fetch = async () => ({ ok: true, json: async () => ({ player: { username: "tester", realm_idx: 3 } }) });
  const r1 = await lib.fetchServerPlayer("tester");
  ok(r1 && r1.realm_idx === 3, "fetchServerPlayer returns the server copy");
  calls.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: "Unknown cultivator" }) });
  const r2 = await lib.fetchServerPlayer("nobody");
  ok(r2 === null, "fetchServerPlayer returns null on 404");
  calls.fetch = async () => { throw new Error("offline"); };
  const r3 = await lib.fetchServerPlayer("tester");
  ok(r3 === null, "fetchServerPlayer returns null when offline");
  calls.fetch = null;

  // ============ 11. source-level wiring ============
  ok(/else if \(battle\.view === "areas"\) \{\s*\n\s*showBattleAreas\(\)/.test(SRC), "battle tab refreshes area locks on entry");
  ok(/!battle\.searching \|\| battle\.mob !== m/.test(SRC), "respawn guard checks the live fight");
  ok(/p\.hp = battle\.php;/.test(SRC), "hp mirror present in battleTick");
  ok(/if \(battle\.php <= 0\) return onPlayerDeath\(\);\n  battle\.pbar/.test(SRC), "zero-HP check runs before trading blows");
  ok(!/function log\(/.test(SRC) && !/log\(\{\}, ""\)/.test(SRC), "dead log() leftovers removed");
  ok(/const elix = `<div class="doll-row">` \+ \[0, 1, 2\]\.map/.test(SRC), "elixir row renders 3 slots");
  ok(/name: "Combat Pill"|name: "Protection Pill"/.test(SRC) === false, "unfillable pill labels removed");
  ok(/Crafting is deferred/.test(SRC) === false, "material wording lives server-side (no stale client copy)");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
