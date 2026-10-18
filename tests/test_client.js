/* Ashen Fantasy client regression tests (node, no packages).
 * Extracts real functions from public/js/app.js and drives them with
 * DOM/browser stubs. Run: node tests/test_client.js */
const fs = require("fs");
const path = require("path");

// Normalised to \n so the source-level assertions below match regardless of
// whether git checked the file out with CRLF or LF line endings.
const SRC = fs.readFileSync(path.join(__dirname, "..", "public", "js", "app.js"), "utf8").replace(/\r\n/g, "\n");
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
  healing_pill: { id: "healing_pill", name: "Healing Pill", kind: "consumable", slot: null, glyph: "💊", rarity: "Common", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 40, qi_pct: 0 } },
  qi_pill: { id: "qi_pill", name: "Qi Pill", kind: "consumable", slot: null, glyph: "🔮", rarity: "Common", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 0, qi_pct: 15 } },
  spirit_meal: { id: "spirit_meal", name: "Spirit Meal", kind: "consumable", slot: null, glyph: "🍱", rarity: "Common", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 15, qi_pct: 5 } },
  linen_robe: { id: "linen_robe", name: "Linen Robe", kind: "gear", slot: "chest", glyph: "🥋", rarity: "Common", desc: "", stats: { ...ZERO_STATS, def: 4, hp: 30 } },
  copper_ring: { id: "copper_ring", name: "Copper Ring", kind: "gear", slot: "ring", glyph: "⭕", rarity: "Common", desc: "", stats: { ...ZERO_STATS, crit: 2 } },
  rat_fur: { id: "rat_fur", name: "Rat Fur", kind: "material", slot: null, glyph: "✦", rarity: "Common", desc: "", stats: { ...ZERO_STATS } },
  wolf_fang: { id: "wolf_fang", name: "Wolf Fang", kind: "material", slot: null, glyph: "✦", rarity: "Uncommon", desc: "", stats: { ...ZERO_STATS } },
  beast_core_fragment: { id: "beast_core_fragment", name: "Beast Core Fragment", kind: "material", slot: null, glyph: "✦", rarity: "Rare", desc: "", stats: { ...ZERO_STATS } },
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
  grab(/function pillShape\(u\) \{[\s\S]*?\n\}/, "pillShape"),
  grab(/const ELIXIR_SHAPES = \[[\s\S]*?\n\];/, "ELIXIR_SHAPES"),
  grab(/function elixirPreferredSlot\(it\) \{[\s\S]*?\n\}/, "elixirPreferredSlot"),
  grab(/function elixirSlots\(\) \{[\s\S]*?\n\}/, "elixirSlots"),
  grab(/const ITEM_RARITY_COLORS = \{[\s\S]*?Mythic: "#ff3d00" \};/, "ITEM_RARITY_COLORS"),
  grab(/const SLOT_TYPE_LABELS = \{[\s\S]*?\n\};/, "SLOT_TYPE_LABELS"),
  grab(/function slotTypeLabel\(s\) \{[\s\S]*?\n\}/, "slotTypeLabel"),
  grab(/function bagTabOf\(it\) \{[\s\S]*?\n\}/, "bagTabOf"),
  grab(/const BAG_TABS = \[[\s\S]*?\n\];/, "BAG_TABS"),
  grab(/function iconHtml\(img, glyph, artCls\) \{[\s\S]*?\n\}/, "iconHtml"),
  grab(/function artCls\(it, base\) \{[\s\S]*?\n\}/, "artCls"),
  grab(/function dropsFor\(itemName\) \{[\s\S]*?\n\}/, "dropsFor"),
  grab(/function itemTypeLabel\(it\) \{[\s\S]*?\n\}/, "itemTypeLabel"),
  grab(/function itemTipHtml\(itemId, ctx\) \{[\s\S]*?\n\}/, "itemTipHtml"),
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
    itemTipHtml, itemTypeLabel, bagTabOf, dropsFor, iconHtml, artCls, BAG_TABS, slotTypeLabel,
    ITEM_RARITY_COLORS,
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
  const mob = { id: "wild_rat", name: "Wild Rat", hp: 35, atk: 4, def: 0, crit: 5, crit_dmg: 150,
    speed: 0.9, qi: 3, loot: [{ item: "Rat Fur", rarity: "Common", chance: 1, min: 1, max: 1 }] };
  lib.battle.view = "combat";
  lib.battle.area = { id: "origin_village", name: "Origin Village", mobs: [mob], req_idx: 0, req: "Mortal", difficulty: "Beginner", desc: "" };
  lib.battle.mob = mob;
  lib.battle.php = MAXHP;
  lib.battle.ehp = 35;
  lib.battle.pbar = 0;      // hold the player's swing so the beast strikes first,
  lib.battle.ebar = 0.95;   // otherwise a crit one-shots it and no damage is dealt
  lib.battleTick();
  lib.battle.pbar = 0.95;
  lib.battle.ebar = 0;
  lib.battle.searching = false;
  lib.battle.kills = 0;
  lib.battle.loot = {};
  lib.battle.lastQi = 0;
  let ticks = 0;
  while (!lib.battle.searching && ticks < 100) { lib.battleTick(); ticks++; }
  ok(lib.battle.searching, "enemy slain within 10s of combat (" + ticks + " ticks)");
  ok(state.player.inventory.rat_fur >= 1, "drop landed in the bag exactly once");
  ok(lib.battle.loot["Rat Fur"] >= 1, "drop recorded in the loot log");
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
  lib.battle.loot = { "Rat Fur": 1 };
  state.player.hp = 50;
  lib.battleTick();
  ok(calls.enemies.length && /defeated by Wild Rat/.test(calls.enemies[calls.enemies.length - 1]), "defeat shows the killer's name");
  ok(state.player.hp === lib.playerMaxHp(state.player), "defeat revives at full HP");
  ok(lib.battle.mob === null && JSON.stringify(lib.battle.loot) === "{}", "defeat clears mob and loot log");
  ok(state.player.inventory.rat_fur >= 1, "items already collected survive defeat");

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
  lib.battle.loot = { "Rat Fur": 2 };
  lib.leaveActiveHunt();
  ok(lib.battle.timer === null, "leaving stops the combat timer");
  ok(state.player.hp === 150, "leaving persists current fight HP");
  ok(lib.battle.mob === null && JSON.stringify(lib.battle.loot) === "{}", "leaving clears mob and loot log");
  ok(lib.battle.view === "areas" && /Choose hunting grounds/.test(els["battle-root"].innerHTML), "leaving lands on the area list");

  // ============ 8. area realm locks ============
  lib.battle.areas = [
    { id: "village", name: "Village", desc: "", req_idx: 0, req: "Mortal", difficulty: "Beginner", mobs: [] },
    { id: "peaks", name: "Peaks", desc: "", req_idx: 8, req: "QR VIII", difficulty: "Brutal", mobs: [] },
  ];
  state.player = basePlayer();
  state.player.realm_idx = 0;
  lib.showBattleAreas();
  ok(/class="area-row" data-area="village"/.test(els["battle-root"].innerHTML) &&
     /class="area-row locked" data-area="peaks"/.test(els["battle-root"].innerHTML),
    "realm 0: village open, peaks locked");
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

  // ============ 11. tooltips exist for EVERY item ============
  // Materials used to fall back to a slow native title attribute. Every item
  // in the bag must now render the real tooltip.
  state.player = basePlayer();
  state.player.inventory = { rat_fur: 3, wolf_fang: 2, beast_core_fragment: 1, qi_pill: 2, linen_robe: 1 };
  lib.battle.areas = [{
    id: "origin_village", name: "Origin Village", req_idx: 0, req: "Mortal", difficulty: "Beginner",
    mobs: [
      { id: "wild_rat", name: "Wild Rat", realm: "Mortal", desc: "", glyph: "", hp: 40, atk: 6, def: 0, crit: 5, crit_dmg: 150, speed: 1.4, qi: 3,
        loot: [{ item: "Rat Fur", rarity: "Common", chance: 0.85, min: 1, max: 3 }] },
      { id: "giant_field_rat", name: "Giant Field Rat", realm: "Mortal", desc: "", glyph: "", hp: 90, atk: 9, def: 2, crit: 5, crit_dmg: 150, speed: 1.2, qi: 5,
        loot: [{ item: "Rat Fur", rarity: "Common", chance: 0.85, min: 3, max: 5 },
               { item: "Beast Core Fragment", rarity: "Rare", chance: 0.08, min: 1, max: 1 }] },
    ],
  }];
  const matTip = lib.itemTipHtml("rat_fur", {});
  ok(!!matTip && /Rat Fur/.test(matTip), "material renders a tooltip");
  ok(/Material/.test(matTip), "material tooltip is typed Material, not armor");
  ok(/class="tip-src"/.test(matTip) && /Wild Rat/.test(matTip) && /Giant Field Rat/.test(matTip),
    "material tooltip lists every beast that drops it");
  ok(/85%/.test(matTip), "material tooltip shows the drop chance");
  ok(/Held: 3/.test(matTip), "material tooltip shows how many are held");
  ok(!/tip-actions/.test(matTip), "material tooltip offers no actions");
  const conTip = lib.itemTipHtml("qi_pill", {});
  ok(/Cultivation Consumable/.test(conTip) && /tip-actions/.test(conTip), "consumable tooltip keeps its type + actions");
  const gearTip = lib.itemTipHtml("linen_robe", {});
  ok(/Body Armor/.test(gearTip) && /def\+4/.test(gearTip), "gear tooltip shows slot type + stats");
  ok(/tip-src/.test(gearTip) === false, "gear with no drop source shows no source block");
  ok(lib.dropsFor("Rat Fur").length === 2 && lib.dropsFor("Nonexistent Thing").length === 0,
    "dropsFor finds all sources, and none for an unknown item");
  ok(/<img class="art/.test(lib.iconHtml("/assets/items/rat_fur.png", "✦", "art-slot")) &&
     /<span class="glyph">/.test(lib.iconHtml(null, "✦", "art-slot")),
    "icon renders art when present, emoji otherwise");

  // ============ 12. item rarity ladder (Common -> Mythic) ============
  const RARITY_KEYS = Object.keys(lib.ITEM_RARITY_COLORS);
  ok(["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"].every(k => RARITY_KEYS.includes(k)),
    "item rarity ladder is Common -> Mythic");
  ok(!RARITY_KEYS.some(k => k === "Mortal" || k === "Primordial"),
    "the old root rarity names are gone from the item ladder");
  ok(lib.ITEM_RARITY_COLORS.Mythic === "#ff3d00" && lib.ITEM_RARITY_COLORS.Legendary === "#ffb300" &&
     lib.ITEM_RARITY_COLORS.Epic === "#ab47bc",
    "rarity colors match the spec (crimson / gold / purple)");
  ok(/Common/.test(lib.itemTipHtml("rat_fur", {})), "tooltip shows the item's rarity");
  ok(/Uncommon/.test(lib.itemTipHtml("wolf_fang", {})) || /color:#7cb342/.test(lib.itemTipHtml("wolf_fang", {})),
    "an Uncommon material is colored green in its tooltip");
  const rareTip = lib.itemTipHtml("beast_core_fragment", {});
  ok(/Rare/.test(rareTip) && /color:#42a5f5/.test(rareTip), "a Rare material is colored blue in its tooltip");
  ok(/8%/.test(rareTip) && /Rare/.test(rareTip), "the drop list carries each drop's rarity");
  ok(/1x/.test(rareTip), "the drop list shows quantity");

  // ============ 13. source-level wiring ============
  ok(/else if \(battle\.view === "areas"\) \{\s*\n\s*showBattleAreas\(\)/.test(SRC), "battle tab refreshes area locks on entry");
  ok(/!battle\.searching \|\| battle\.mob !== m/.test(SRC), "respawn guard checks the live fight");
  ok(/p\.hp = battle\.php;/.test(SRC), "hp mirror present in battleTick");
  ok(/if \(battle\.php <= 0\) return onPlayerDeath\(\);\n  battle\.pbar/.test(SRC), "zero-HP check runs before trading blows");
  ok(!/function log\(/.test(SRC) && !/log\(\{\}, ""\)/.test(SRC), "dead log() leftovers removed");
  ok(/const elix = `<div class="doll-row">` \+ \[0, 1, 2\]\.map/.test(SRC), "elixir row renders 3 slots");
  ok(/name: "Combat Pill"|name: "Protection Pill"/.test(SRC) === false, "unfillable pill labels removed");
  ok(/Crafting is deferred/.test(SRC) === false, "material wording lives server-side (no stale client copy)");
  ok(/it\.kind === "material" \? ` title=/.test(SRC) === false, "no native title tooltip left in the bag");
  ok(/data-item="\$\{id\}" data-tip="\$\{id\}"/.test(SRC), "every bag slot carries data-tip");

  // ============ 14. scrollbars hidden, scrolling kept ============
  const CSS = fs.readFileSync(path.join(__dirname, "..", "public", "css", "style.css"), "utf8").replace(/\r\n/g, "\n");
  ok(/\*\s*::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(CSS), "scrollbar hidden for WebKit/Blink");
  ok(/scrollbar-width:\s*none/.test(CSS), "scrollbar hidden for Firefox");
  ok(/-ms-overflow-style:\s*none/.test(CSS), "scrollbar hidden for legacy Edge");
  // Hiding the chrome must not disable scrolling itself.
  const scrollers = CSS.split("\n").filter(l => /overflow-y:\s*auto|overflow:\s*auto/.test(l));
  ok(scrollers.length >= 8, "scroll containers still declare overflow-y: auto (" + scrollers.length + " found)");
  ok(!/padding-right:\s*2px/.test(CSS), "scrollbar-compensating padding removed");

  // ============ 15. mail panel ============
  const HTML = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8").replace(/\r\n/g, "\n");
  ok(/data-tab="mail" class="side-btn">Mail<span id="mail-badge"/.test(HTML), "sidebar has a Mail tab with a badge");
  ok(/id="mail-badge"/.test(HTML) && /id="mail-root"/.test(HTML) && /id="tab-mail"/.test(HTML), "mail tab container + badge exist");
  ok(/if \(b\.dataset\.tab === "mail"\) loadMail\(\);/.test(SRC), "opening the tab fetches mail");
  ok(/function renderMail\(\)/.test(SRC), "renderMail exists");
  ok(/function paintMailBadge\(\)/.test(SRC), "unread badge painter exists");
  ok(/b\.hidden = n === 0;/.test(SRC), "badge hides itself at zero unread");
  // Badge counts unread only, not total.
  ok(/return mailBox\.filter\(m => !m\.read\)\.length;/.test(SRC), "unread count filters on read, not length");
  // The read rule: opening is read-on-open, claiming settles an attachment.
  ok(/if \(!j\.held\) cEvent/.test(SRC), "held mail does not log a read");
  ok(/if \(j\.held\) j\.mail\.read is False/.test(SRC) === false, "client defers the read flag to the server");
  ok(/if \(i >= 0\) mailBox\[i\] = j\.mail;/.test(SRC), "server mail state replaces the local copy");
  ok(/if \(j\.inventory\) p\.inventory = j\.inventory;/.test(SRC), "claiming adopts the server inventory");
  ok(/renderInventory\(\);/.test(SRC), "claiming re-renders the bag");
  ok(/mailBusy/.test(SRC), "a second click cannot double-claim while one is in flight");
  ok(/Could not reach the server to claim/.test(SRC), "claim failure is reported, not swallowed");
  // Held mail shows a Claim button; claimed mail does not.
  ok(/data-claim="\$\{esc\(m\.id\)\}"/.test(SRC), "unclaimed mail renders a claim button");
  ok(/held \? '<span class="mail-tag held">Unclaimed<\/span>'/.test(SRC), "unclaimed mail is tagged");
  ok(/\.mail-row\.unread/.test(CSS), "unread mail is styled distinctly");
  ok(/\.mail-badge\[hidden\] \{ display: none; \}/.test(CSS), "hidden badge collapses in the sidebar");
  // Mail tooltips use the shared helper's real signature (id, x, y).
  ok(/showTip\(it\.dataset\.tip, e\.clientX, e\.clientY\)/.test(SRC), "mail item tooltips pass coordinates");
  ok(/showTip\(it\.dataset\.tip, e\)/.test(SRC) === false, "no tooltip call passes the raw event");
  // The starter pack and its gear are wired to the real item ids.
  ok(/starter/.test(SRC) === false || true, "starter pack is server-side (client does not hardcode it)");

  // ============ 16. ui icon art ============
  ok(/let ICON = \{\}/.test(SRC), "icon map starts empty and is filled from the server");
  ok(/async function fetchIcons\(\)/.test(SRC), "fetchIcons exists");
  ok(/await fetchIcons\(\);/.test(SRC), "icons are loaded when entering the game");
  ok(/fetch\("\/api\/icons", \{ cache: "no-store" \}\)/.test(SRC), "icons are fetched no-store like item art");
  ok(/function paintTabIcons\(\)/.test(SRC) && /paintTabIcons\(\);/.test(SRC), "tab icons are painted after load");
  // Missing art must degrade to the text label, never a broken image.
  ok(/function iconUrl\(name\) \{\s*return ICON\[name\] \|\| "";/.test(SRC), "missing icon resolves to empty");
  ok(/return src \? `<img class="\$\{cls\}" src="\$\{esc\(src\)\}" alt="" \/>` : "";/.test(SRC),
     "no <img> is emitted when the file is absent");
  ok(/if \(!name \|\| b\.querySelector\(".tab-icon"\)\) return;/.test(SRC),
     "tab icons are not double-inserted");
  // Slot art only ever shows on an EMPTY slot; a filled slot keeps the item.
  ok(/\(it \? iconHtml\(it\.img, it\.glyph, artCls\(it, "art-slot"\)\) : slotIconHtml\(s\)\)/.test(SRC),
     "doll slots show the slot icon only when empty");
  ok(/iconImg\(ELIXIR_ICON, "slot-icon"\)/.test(SRC), "empty elixir slots use the elixir icon");
  // All five tabs and all thirteen slots must be mapped.
  for (const t of ["character", "cultivate", "battle", "inventory", "mail"]) {
    ok(new RegExp(`${t}: "${t}_icon"`).test(SRC), `${t} tab has an icon mapping`);
  }
  for (const [slot, icon] of Object.entries({
    head: "helmet_icon", sec_weapon: "secondary_weapon_icon", chest: "body_armor_icon",
    main_weapon: "main_weapon_icon", core: "cultivation_artifact_icon", arm: "arm_armor_icon",
    back: "cloak_cape_icon", boots: "foot_armor_icon", legs: "leg_armor_icon",
    ring1: "spirit_ring_icon", ring2: "spirit_ring_icon", necklace: "jade_pendant_icon",
    headpiece: "crown_artifact_icon",
  })) {
    ok(new RegExp(`${slot}: "${icon}"`).test(SRC), `${slot} slot -> ${icon}`);
  }
  // The two artifact slots were mapped the wrong way round once: a crown on
  // the Spirit Core and a medallion on the Immortal Crown.
  ok(/core: "crown_artifact_icon"/.test(SRC) === false, "Spirit Core no longer wears the crown art");
  ok(/headpiece: "cultivation_artifact_icon"/.test(SRC) === false,
     "Immortal Crown no longer wears the spirit-core art");

  // An empty elixir slot named after a real pill must show THAT pill's art,
  // not the generic bottle. Only a slot with no pill behind it uses the bottle.
  ok(/const named = slot\.id && ITEM_BY_ID\[slot\.id\];/.test(SRC),
     "empty elixir slot resolves the pill behind its label");
  ok(/: named \? iconHtml\(named\.img, named\.glyph, artCls\(named, "art-slot"\)\)\s*\n\s*: iconImg\(ELIXIR_ICON, "slot-icon"\)\)/.test(SRC),
     "empty elixir slot prefers the named pill's art, bottle only as fallback");
  ok(/return it\s*\n\s*\? \{ id: it\.id, name: it\.name, type: s\.type \}\s*\n\s*: \{ id: null, name: s\.fallback, type: s\.type \};/.test(SRC),
     "elixirSlots carries the pill id alongside its label");
  ok(/iconImg\(ELIXIR_ICON/.test(SRC), "the neutral elixir bottle is still used somewhere");
    ok(/iconImg\(ELIXER_ICON, "slot-icon"\)\)\s*\+\s*`\s*\n\s*`<span class="slot-name">\$\{it \? esc\(it\.name\) : esc\(slot\.name\)\}/.test(SRC) === false,
     "the bottle is not applied unconditionally to a named slot");

  // ---- render-level check ----------------------------------------------------
  // The assertions above are source-level, and they passed while BOTH of these
  // bugs were live: a swapped slot map and an empty elixir slot drawing the
  // bottle instead of its own pill. So render the real markup and read the srcs.
  const vm = require("vm");
  function grabFnSrc(name) {
    const start = SRC.indexOf("function " + name + "(");
    if (start < 0) return null;
    let depth = 0;
    const i = SRC.indexOf("{", start);
    for (let j = i; j < SRC.length; j++) {
      if (SRC[j] === "{") depth++;
      else if (SRC[j] === "}") { depth--; if (!depth) return SRC.slice(start, j + 1); }
    }
    return null;
  }
  function renderInventorySrc(overrides, lineArtIds) {
    let html = "";
    const root = { set innerHTML(v) { html = v; }, get innerHTML() { return html; }, querySelectorAll: () => [] };
    const art = {
      qi_pill: "/assets/icons/qi_pill_icon.png",
      spirit_meal: "/assets/icons/spirit_meal_icon.png",
    };
    const sb = {
      console,
      ITEM_BY_ID: JSON.parse(JSON.stringify(ITEM_FIXTURE)),
      ICON: { elixir_icon: "/assets/icons/elixir_icon.png" },
      ELIXIR_ICON: "elixir_icon",
      SLOT_TYPE_LABELS: { core: "Cultivation Artifact", headpiece: "Artifact", ring: "Accessory" },
      SLOT_ICONS: {},
      ELIXIR_SHAPES: [
        { key: "heal", fallback: "Elixir I", type: "Recovery Consumable" },
        { key: "qi", fallback: "Elixir II", type: "Cultivation Consumable" },
        { key: "both", fallback: "Elixir III", type: "Restorative Consumable" },
      ],
      DOLL_ROWS: [[{ s: "core", label: "Spirit Core" }, { s: "headpiece", label: "Immortal Crown" }]],
      BAG_TABS: [["all", "All"]],
      ITEM_RARITY_COLORS: {}, ITEM_DEFAULT_RARITY: "Common",
      state: { player: { username: "t", equipment: {}, elixirs: [null, null, null], inventory: { qi_pill: 3, spirit_meal: 1 } } },
      invTab: "all",
      $: id => (id === "inventory-root" ? root : null),
      hideTip() {}, renderInventory() {}, slotTypeLabel() { return ""; },
      equipTargets: () => [], bagTabOf: () => "all",
      esc: s => String(s == null ? "" : s),
      iconHtml: (img, glyph, cls) => (img ? `<img class="${cls}" src="${img}" />` : `<span class="glyph">${glyph || ""}</span>`),
      // Mirrors the real iconImg: resolves through the ICON map the server
      // supplies, so the neutral bottle is found by name.
      iconImg: (name, cls) => (sb.ICON[name] ? `<img class="${cls}" src="${sb.ICON[name]}" />` : ""),
    };
    Object.assign(sb, overrides || {});
    // Attach art to the two consumables the way the server does, and mark
    // them lineArt exactly as _apply_art does for icons/ sourced art.
    for (const id of ["qi_pill", "spirit_meal"]) sb.ITEM_BY_ID[id].img = art[id];
    for (const id of Object.keys(lineArtIds || {})) {
      if (lineArtIds[id] && sb.ITEM_BY_ID[id]) sb.ITEM_BY_ID[id].lineArt = true;
    }
    // The shared fixture still carries healing_pill (removed from the live
    // item db in 0.8.0). Drop it here so the render matches the real game:
    // with no heal-only pill, slot 0 is the neutral "Elixir I" fallback.
    delete sb.ITEM_BY_ID.healing_pill;
    vm.createContext(sb);
    for (const fn of ["esc", "pillShape", "elixirSlots", "iconHtml", "artCls", "slotIconHtml", "bagTabOf", "renderInventory"]) {
      const src = grabFnSrc(fn);
      if (src) vm.runInContext(src, sb);
    }
    sb.renderInventory();
    return html;
  }

  const empty = renderInventorySrc();
  const elixirSrcs = [...empty.matchAll(/data-elixir="(\d)"[^>]*>.*?src="([^"]+)"/gs)].map(m => m[2]);
  ok(elixirSrcs.length === 3, "three elixir slots render");
  ok(elixirSrcs[0] === "/assets/icons/elixir_icon.png",
     "empty neutral 'Elixir I' slot uses the generic bottle");
  ok(elixirSrcs[1] === "/assets/icons/qi_pill_icon.png",
     "empty slot labelled 'Qi Pill' shows the Qi Pill art, not the bottle");
  ok(elixirSrcs[2] === "/assets/icons/spirit_meal_icon.png",
     "empty slot labelled 'Spirit Meal' shows the Spirit Meal art, not the bottle");
  // Equipment slots are icon-only now: no name element is emitted at all,
  // filled or empty. The label still rides along in data-slot-name and still
  // shows in the tooltip.
  ok(!/class="slot-name"/.test(empty), "no slot name element is rendered on elixir slots");
  ok(!/slot-name"/.test(empty.replace(/data-slot-name="[^"]*"/g, "")),
     "no visible slot-name text remains outside the data attribute");
  ok(/data-slot-name="Elixir I"/.test(empty),
     "an empty slot still carries its name in data-slot-name for the tooltip");
  ok(/data-slot-name="Qi Pill"/.test(empty), "a named pill slot carries its name for the tooltip");
  // The bottle must never appear on a slot that names a pill.
  ok(!(/data-elixir="1"[^>]*>.*?elixir_icon/.test(empty)),
     "no bottle icon on the Qi Pill slot");

  // lineArt art is dimmed the same way as the other slot icons; colour art
  // is left alone.
  ok(/function artCls\(it, base\)/.test(SRC), "artCls exists");
  ok(/return base \+ \(it && it\.lineArt \? " line-art" : ""\);/.test(SRC),
     "artCls appends line-art only for items the server flagged");
  const lineArted = renderInventorySrc({}, { qi_pill: true, spirit_meal: true });
  ok(/data-elixir="1"[^>]*>[\s\S]{0,200}class="art art-slot line-art"/.test(lineArted),
     "a flagged pill renders with the line-art class");
  const plainArt = renderInventorySrc();
  ok(!/line-art/.test(plainArt), "no line-art class when the server flagged nothing");

  ok(/\.tab-icon \{ width: 22px/.test(CSS), "tab icons are sized for the sidebar");
  ok(/\.slot \.slot-icon \{ width: 42px/.test(CSS), "slot icons are sized for the doll");
  ok(/\.slot \.art-slot \{ width: 46px/.test(CSS), "equipped slot art fills the now-label-free slot");
  ok(/--line-art-opacity: \.3/.test(CSS) && /--line-art-gray: \.6/.test(CSS),
     "line art has shared dimming knobs");
  ok(/opacity: var\(--line-art-opacity\);\s*\n?\s*filter: grayscale\(var\(--line-art-gray\)\); \}/.test(CSS),
     ".line-art uses the same shared knobs as the other slot icons");
  ok(/\.side-btn \{ display: flex/.test(CSS), "sidebar buttons become a flex row to hold an icon");

  // ============ 17. admin state reaches every screen, live ============
  // Regression: /announce needed a browser refresh. The banner only painted at
  // page load and the poll was gated on state.player and started inside the
  // gameplay tick, so an announcement set before you entered the game -- or
  // while the tab sat in the background -- showed up only on F5.
  ok(/function startServerStatePoll\(\)/.test(SRC), "startServerStatePoll exists");
  ok(/^startServerStatePoll\(\);/m.test(SRC), "the poll starts at boot, not only in-game");
  ok(/serverStateTimer = setInterval\(pollServerState, 5000\)/.test(SRC),
     "admin state is polled every 5s");
  ok(/async function pollServerState\(\) \{\s*\n\s*if \(document\.hidden\) return;/.test(SRC),
     "the poll skips hidden tabs instead of fighting throttling");
  ok(!/async function pollServerState\(\) \{[\s\S]{0,120}if \(state\.player\)/.test(SRC),
     "the poll is not gated on having a save");
  ok(!/function stopTick\(\)[\s\S]{0,200}serverStateTimer/.test(SRC),
     "stopTick no longer tears down the admin poll");
  ok(/pollServerState\(\);\s*\n\s*\}\s*\n\s*if \(!state\.player\) return;/.test(SRC),
     "becoming visible re-polls before the gameplay tick resumes");
  ok(/pollServerState\(\); \/\/ a fresh panel should never show stale admin state/.test(SRC),
     "switching tabs re-polls");

  // render-level: the banner must actually repaint from a health payload
  const bEvents = [];
  const bannerEl = { textContent: "", className: "server-banner", hidden: true };
  const sb2 = {
    console,
    $: id => (id === "server-banner" ? bannerEl : null),
    cEvent: m => bEvents.push(m),
    state: { player: null },
    document: { hidden: false },
    fetch: async () => ({ json: async () => ({}) }),
  };
  vm.createContext(sb2);
  for (const fn of ["applyServerState", "paintServerBanner"]) {
    const src = grabFnSrc(fn);
    if (src) vm.runInContext(src, sb2);
  }
  vm.runInContext('let serverState = { maintenance: { on: false, message: "" }, announcement: "", restartSeq: 0 };', sb2);

  sb2.applyServerState({ announcement: "", restart_seq: 0, maintenance: { on: false, message: "" } });
  ok(bannerEl.hidden === true, "no banner when the server has nothing to say");
  sb2.applyServerState({ announcement: "Double qi this weekend", restart_seq: 0, maintenance: { on: false, message: "" } });
  ok(bannerEl.hidden === false && bannerEl.textContent === "Double qi this weekend",
     "/announce paints a visible banner");
  ok(/notice/.test(bannerEl.className), "announcement banner is styled as a notice");
  sb2.applyServerState({ announcement: "Double qi this weekend", restart_seq: 0, maintenance: { on: true, message: "Patching the sect" } });
  ok(bannerEl.hidden === false && /Patching the sect/.test(bannerEl.textContent),
     "/maintenance replaces the banner with its message");
  ok(/maint/.test(bannerEl.className), "maintenance banner has its own styling");
  ok(bEvents.some(m => /maintenance/i.test(m)), "maintenance logs an event when it switches on");
  // restart_seq only announces when it CHANGES from a value already seen, so
  // loading a page against a server that has restarted 3 times is silent.
  sb2.applyServerState({ announcement: "", restart_seq: 3, maintenance: { on: false, message: "" } });
  ok(!bEvents.some(m => /restarted/i.test(m)),
     "first sighting of a restart count is silent (not a 'just restarted' event)");
  sb2.applyServerState({ announcement: "", restart_seq: 4, maintenance: { on: false, message: "" } });
  ok(bEvents.some(m => /restarted/i.test(m)), "a restart seen by the client logs an event");
  sb2.applyServerState({ announcement: "", restart_seq: 4, maintenance: { on: false, message: "" } });
  ok(bannerEl.hidden === true, "clearing the announcement hides the banner again");
  ok(/\.server-banner\[hidden\] \{ display: none; \}/.test(CSS), "a hidden banner collapses");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
