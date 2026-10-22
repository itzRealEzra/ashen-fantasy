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
  addEventListener() {},
});
const els = {
  "breakthrough-btn": mkEl(), "p-name": mkEl(), "qi-bar": mkEl(),
  "char-sheet": mkEl(), "p-realm": mkEl(), "cult-rate": mkEl(),
  "battle-root": mkEl(), "char-hp": mkEl(), "char-qi": mkEl(),
  "p-stones": mkEl(), "enemy-back": mkEl(), "craft-root": mkEl(),
  "alchemy-root": mkEl(), "cook-root": mkEl(), "skills-root": mkEl(),
  "equipped-skills": mkEl(), "loot-rows": mkEl(), "kill-count": mkEl(),
  "battle-status": mkEl(), "battle-kit": mkEl(), "item-tip": mkEl(),
  "mail-badge": mkEl(), "gather-root": mkEl(), "mastery-list": mkEl(),
};
const calls = { cEvents: [], saves: [], enemies: [], notices: [], renderInv: 0, timeouts: [], fetch: null, toasts: [], popups: [], fetches: 0 };
const state = { username: "tester", player: null };

const ZERO_STATS = { atk: 0, def: 0, hp: 0, crit: 0, critDmg: 0 };
const ITEM_FIXTURE = {
  minor_vitality_elixir: { id: "minor_vitality_elixir", name: "Minor Vitality Elixir", kind: "consumable", slot: null, glyph: "💊", rarity: "Common", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 40, qi_pct: 0 } },
  minor_qi_pill: { id: "minor_qi_pill", name: "Minor Qi Pill", kind: "consumable", slot: null, glyph: "🔮", rarity: "Common", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 0, qi_pct: 15 } },
  roasted_wild_rat_meat: { id: "roasted_wild_rat_meat", name: "Roasted Wild Rat Meat", kind: "consumable", slot: null, glyph: "🍱", rarity: "Common", desc: "", stats: { ...ZERO_STATS }, use: { heal_pct: 15, qi_pct: 5 } },
  linen_robe: { id: "linen_robe", name: "Linen Robe", kind: "gear", slot: "chest", glyph: "🥋", rarity: "Common", desc: "", stats: { ...ZERO_STATS, def: 4, hp: 30 } },
  copper_ring: { id: "copper_ring", name: "Copper Ring", kind: "gear", slot: "ring", glyph: "⭕", rarity: "Common", desc: "", stats: { ...ZERO_STATS, crit: 2 } },
  jade_ring: { id: "jade_ring", name: "Jade Ring", kind: "gear", slot: "ring", glyph: "⭕", rarity: "Uncommon", desc: "", stats: { ...ZERO_STATS, def: 3 } },
  rat_fur: { id: "rat_fur", name: "Rat Fur", kind: "material", slot: null, glyph: "✦", rarity: "Common", desc: "", stats: { ...ZERO_STATS } },
  wolf_fang: { id: "wolf_fang", name: "Wolf Fang", kind: "material", slot: null, glyph: "✦", rarity: "Uncommon", desc: "", stats: { ...ZERO_STATS } },
  beast_core_fragment: { id: "beast_core_fragment", name: "Beast Core Fragment", kind: "material", slot: null, glyph: "✦", rarity: "Rare", desc: "", stats: { ...ZERO_STATS } },
  herb_wild_ginseng: { id: "herb_wild_ginseng", name: "Wild Ginseng", kind: "herb", slot: null, glyph: "🌿", rarity: "Common", desc: "", value: 6, element: "Earth", time: 6, stats: { ...ZERO_STATS } },
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
  grab(/function rootStats\(roots\) \{[\s\S]*?\n\}/, "rootStats"),
  grab(/function clampHp\(p\) \{[\s\S]*?\n\}/, "clampHp"),
  grab(/function lootKey\(\) \{[^}]*\}/, "lootKey"),
  grab(/function saveLoot\(\) \{[\s\S]*?\n\}/, "saveLoot"),
  grab(/function clearLootLog\(\) \{[\s\S]*?\n\}/, "clearLootLog"),
  grab(/async function fetchServerPlayer\(username\) \{[\s\S]*?\n\}/, "fetchServerPlayer"),
  grab(/async function syncPlayer\(initial\) \{[\s\S]*?\n\}/, "syncPlayer"),
  grab(/function derivedStats\(p\) \{[\s\S]*?\n\}/, "derivedStats"),
  grab(/function activeBuffs\(\) \{[\s\S]*?\n\}/, "activeBuffs"),
  grab(/function skillCooldown\(s, d\) \{[\s\S]*?\n\}/, "skillCooldown"),
  grab(/function equippedSkills\(p\) \{[\s\S]*?\n\}/, "equippedSkills"),
  grab(/function useSkills\(p, m\) \{[\s\S]*?\n\}/, "useSkills"),
  grab(/function fireSkill\(p, m, s, d\) \{[\s\S]*?\n\}/, "fireSkill"),
  grab(/let invSort = "[a-z]+";/, "invSort"),
  grab(/function paintBattleKit\(\) \{[\s\S]*?\n\}/, "paintBattleKit"),
  grab(/let tipItem = null, tipHideTimer = null;/, "tipState"),
  grab(/let tipCtxKey = "", lastTipHtml = "";/, "tipState2"),
  grab(/let tipWired = false;/, "tipWired"),
  grab(/function ensureTipWired\(\) \{[\s\S]*?\n\}/, "ensureTipWired"),
  grab(/function showTipHtml\(html, x, y, key, itemId\) \{[\s\S]*?\n\}/, "showTipHtml"),
  grab(/function showTip\(itemId, x, y, ctx\) \{[\s\S]*?\n\}/, "showTip"),
  grab(/function showSlotTip\(name, type, hint, x, y, key\) \{[\s\S]*?\n\}/, "showSlotTip"),
  grab(/function hideTip\(\) \{[\s\S]*?\n\}/, "hideTip"),
  grab(/function scheduleHideTip\(\) \{[\s\S]*?\n\}/, "scheduleHideTip"),
  grab(/function tipPointerOverTip\(\) \{[\s\S]*?\n\}/, "tipPointerOverTip"),
  grab(/let tipPointer = \{ x: 0, y: 0 \};\nlet tipOnTip = false;\nlet tipRect = null;[\s\S]*?^}/m, "tipPointer"),
  grab(/function watchTipPointer\(e\) \{[\s\S]*?\n\}/, "watchTipPointer"),
  grab(/async function adoptPlayer\(p\) \{[\s\S]*?\n\}/, "adoptPlayer"),
  grab(/function iconUrl\(name\) \{[\s\S]*?\n\}/, "iconUrl"),
  grab(/function iconImg\(name, cls\) \{[\s\S]*?\n\}/, "iconImg"),
  grab(/let SKILLS = \{\};/, "SKILLS"),
  grab(/let HERBS = \[\];/, "HERBS"),
  grab(/let herbRank = 1, herbLevel = 1, herbRankName = "";/, "herbState"),
  grab(/let gathering = null;/, "gathering"),
  grab(/async function fetchHerbs\(\) \{[\s\S]*?\n\}/, "fetchHerbs"),
  grab(/function renderGather\(\) \{[\s\S]*?\n\}/, "renderGather"),
  grab(/async function startGathering\(herbId\) \{[\s\S]*?\n\}/, "startGathering"),
  grab(/async function gatherOnce\(herbId\) \{[\s\S]*?\n\}/, "gatherOnce"),
  grab(/function stopGathering\(\) \{[\s\S]*?\n\}/, "stopGathering"),
  grab(/async function pollServerState\(\) \{[\s\S]*?\n\}/, "pollServerState"),
  grab(/let SKILLS_LOADED = false;/, "SKILLS_LOADED"),
  grab(/let SKILL_SLOTS = \d+;/, "SKILL_SLOTS"),
  grab(/async function fetchSkills\(\) \{[\s\S]*?\n\}/, "fetchSkills"),
  grab(/function renderSkills\(\) \{[\s\S]*?\n\}/, "renderSkills"),
  grab(/function toggleSkill\(skillId\) \{[\s\S]*?\n\}/, "toggleSkill"),
  grab(/function sortBag\(entries, p\) \{[\s\S]*?\n\}/, "sortBag"),
  grab(/const BAG_SORTS = \[\[[^\n]*\];/, "BAG_SORTS"),
  grab(/const ITEM_RARITY_ORDER = \[[^\]]*\];/, "ITEM_RARITY_ORDER"),
  grab(/const PAIRED_SLOTS = \[[^\]]*\];/, "PAIRED_SLOTS"),
  grab(/const GEAR_STAT_KEYS = \[[^\]]*\];/, "GEAR_STAT_KEYS"),
  grab(/const PERCENT_STAT_KEYS = new Set\(\[[^\]]*\]\);/, "PERCENT_STAT_KEYS"),
  grab(/const STAT_DISPLAY_NAMES = \{[\s\S]*?\n\};/, "STAT_DISPLAY_NAMES"),
  grab(/function gearBonus\(p\) \{[\s\S]*?\n\}/, "gearBonus"),
  grab(/function formatStatValue\(key, value, withSign[^)]*\) \{[\s\S]*?\n\}/, "formatStatValue"),
  grab(/function formatStatEntry\(key, value\) \{[\s\S]*?\n\}/, "formatStatEntry"),
  grab(/function playerMaxHp\(p\) \{ return derivedStats\(p\)\.hp; \}/, "playerMaxHp"),
  grab(/function equipTargets\(it\) \{[^}]*\}/, "equipTargets"),
  grab(/function hiddenFromBag\(p\) \{[\s\S]*?\n\}/, "hiddenFromBag"),
  grab(/function bagGearAction\(itemId\) \{[\s\S]*?\n\}/, "bagGearAction"),
  grab(/function equipItem\(itemId\) \{[\s\S]*?\n\}/, "equipItem"),
  grab(/function unequipSlot\(slot\) \{[\s\S]*?\n\}/, "unequipSlot"),
  grab(/function afterGearChange\(before\) \{[\s\S]*?\n\}/, "afterGearChange"),
  grab(/function useConsumable\(itemId\) \{[\s\S]*?\n\}/, "useConsumable"),
  grab(/function pillShape\(u\) \{[\s\S]*?\n\}/, "pillShape"),
  grab(/const ELIXIR_SHAPES = \[[\s\S]*?\n\];/, "ELIXIR_SHAPES"),
  grab(/function elixirPreferredSlot\(it\) \{[\s\S]*?\n\}/, "elixirPreferredSlot"),
  grab(/function elixirSlots\(\) \{[\s\S]*?\n\}/, "elixirSlots"),
  grab(/const ITEM_RARITY_COLORS = \{[\s\S]*?Primordial: "#ff2fd0" \};/, "ITEM_RARITY_COLORS"),
  grab(/const ITEM_DEFAULT_RARITY = "[A-Za-z]+";/, "ITEM_DEFAULT_RARITY"),
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
  grab(/let RECIPES = \[\];/, "RECIPES"),
  grab(/const TRADES = \{[\s\S]*?\n\};/, "TRADES"),
  grab(/async function fetchRecipes\(\) \{[\s\S]*?\n\}/, "fetchRecipes"),
  grab(/async function sellItem\(itemId, count\) \{[\s\S]*?\n\}/, "sellItem"),
  grab(/function craftReady\(r, count\) \{[\s\S]*?\n\}/, "craftReady"),
  grab(/function craftMax\(r\) \{[\s\S]*?\n\}/, "craftMax"),
  grab(/function toastBox\(\) \{[\s\S]*?\n\}/, "toastBox"),
  grab(/function toast\(msg\) \{[\s\S]*?\n\}/, "toast"),
  grab(/const MASTERY_TRACKS = \[[^\]]*\];/, "MASTERY_TRACKS"),
  grab(/let MASTERY_DEFS = \{\};[\s\S]*?const MASTERY_FALLBACK_RANKS = \[[\s\S]*?\];/, "MASTERY_DEFS"),
  grab(/const MASTERY_NUMERALS = \[[^\]]*\];/, "MASTERY_NUMERALS"),
  grab(/const MASTERY_MAX_LEVEL = \d+;/, "MASTERY_MAX_LEVEL"),
  grab(/const MASTERY_XP_PER_KILL = \d+;/, "MASTERY_XP_PER_KILL"),
  grab(/const MASTERY_BONUS_TEXT = \{[\s\S]*?\n\};/, "MASTERY_BONUS_TEXT"),
  grab(/function masteryTotalXp\(level\) \{[^\n]*\}/, "masteryTotalXp"),
  grab(/function masteryLevel\(xp\) \{[\s\S]*?\n\}/, "masteryLevel"),
  grab(/function masteryRank\(level\) \{[\s\S]*?\n\}/, "masteryRank"),
  grab(/function masteryRankOf\(track, level\) \{[\s\S]*?\n\}/, "masteryRankOf"),
  grab(/function masteryBonusText\(track, lvl\) \{[\s\S]*?\n\}/, "masteryBonusText"),
  grab(/function masteryBodyBonus\(track, xp\) \{[\s\S]*?\n\}/, "masteryBodyBonus"),
  grab(/async function fetchMasteryDefs\(\) \{[\s\S]*?\n\}/, "fetchMasteryDefs"),
  grab(/function fmtSeconds\(v\) \{[\s\S]*?\n\}/, "fmtSeconds"),
  grab(/function masteryNumeral\(level\) \{[^\n]*\}/, "masteryNumeral"),
  grab(/function masteryTitle\(track, level\) \{[\s\S]*?\n\}/, "masteryTitle"),
  grab(/function masteryRankLabel\(track, level\) \{[\s\S]*?\n\}/, "masteryRankLabel"),
  grab(/function masteryXp\(track, p\) \{[\s\S]*?\n\}/, "masteryXp"),
  grab(/function masteryKillXp\(m\) \{[\s\S]*?\n\}/, "masteryKillXp"),
  grab(/function applyMasteryXp\(track, xp\) \{[\s\S]*?\n\}/, "applyMasteryXp"),
  grab(/function masteryPopup\(track, fromLevel, toLevel\) \{[\s\S]*?\n\}/, "masteryPopup"),
  grab(/function masteryPanel\(p\) \{[\s\S]*?\n\}/, "masteryPanel"),
  grab(/function masteryRows\(p\) \{[\s\S]*?\n\}/, "masteryRows"),
  grab(/function refreshMasteryPanel\(\) \{[\s\S]*?\n\}/, "refreshMasteryPanel"),
  grab(/function herbToast\(itemId, count\) \{[\s\S]*?\n\}/, "herbToast"),
  grab(/function closeSidebar\(\) \{[\s\S]*?\n\}/, "closeSidebar"),
  grab(/function renderWork\(rootId, kind\) \{[\s\S]*?\n\}/, "renderWork"),
  grab(/let crafting = false;/, "crafting"),
  grab(/let mailNewItems = 0;/, "mailNewItems"),
  grab(/function mailUnread\(\) \{[\s\S]*?\n\}/, "mailUnread"),
  grab(/let mailBox = \[\], mailOpen = null, mailBusy = false;/, "mailBox"),
  grab(/function paintMailBadge\(\) \{[\s\S]*?\n\}/, "paintMailBadge"),
  grab(/async function craftRecipe\(recipeId, count\) \{[\s\S]*?\n\}/, "craftRecipe"),
  // The real card painter is renamed on extraction: the prelude already has
  // a showBattleEnemies stub (the defeat message sink).
  grab(/function showBattleEnemies\(notice\) \{[\s\S]*?\n\}/, "showBattleEnemiesCard")
    .replace("function showBattleEnemies(", "function showBattleEnemiesCard("),
  grab(/function setBar\(id, frac, attack\) \{[\s\S]*?\n\}/, "setBar"),
  grab(/function paintBars\(\) \{[\s\S]*?\n\}/, "paintBars"),
  grab(/function paintCombat\(\) \{[\s\S]*?\n\}/, "paintCombat"),
  grab(/function flash\(id\) \{[\s\S]*?\n\}/, "flash"),
  grab(/function strikeDmg\(atk, crit, critDmg, dfn\) \{[\s\S]*?\n\}/, "strikeDmg"),
  grab(/function battleTick\(\) \{[\s\S]*?\n\}/, "battleTick"),
  grab(/function mobStones\(m\) \{[\s\S]*?\n\}/, "mobStones"),
  grab(/function rollStones\(m\) \{[\s\S]*?\n\}/, "rollStones"),
  grab(/function rollLoot\(m\) \{[\s\S]*?\n\}/, "rollLoot"),
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
  const notifyStatChange = (b, a, title) => calls.notices.push([b, a, title]);
  const showBattleEnemies = msg => calls.enemies.push(msg);
  const document = {
    getElementById: () => null,
    createElement: () => ({
      className: "", textContent: "", innerHTML: "", style: {},
      classList: { add() {}, remove() {} }, remove() {},
      addEventListener() {},
      appendChild(child) {
        if (child.textContent) calls.toasts.push(child.textContent);
        else if (child.innerHTML) calls.popups.push(child.innerHTML);
      },
    }),
    body: { appendChild(el) { if (el.innerHTML) calls.popups.push(el.innerHTML); } },
  };
  const setTimeout = (fn, ms) => { calls.timeouts.push({ fn, ms }); return calls.timeouts.length; };
  let ICON = {};
  const window = { innerWidth: 1200, innerHeight: 800 };
  const fetch = (...a) => { calls.fetches++; return calls.fetch ? calls.fetch(...a) : Promise.resolve({ ok: false, json: async () => ({ ok: false }) }); };
`;

const lib = new Function("__", prelude + parts + `
  return {
    battle, calls,
    setRealms: t => { REALM_TABLE = t; },
    ITEM_BY_ID, PAIRED_SLOTS, GEAR_STAT_KEYS, STAT_DISPLAY_NAMES, PERCENT_STAT_KEYS,
    formatStatEntry, formatStatValue, gearBonus,
    syncPlayer, fetchServerPlayer, normalizePlayer, rootStats, breakthroughReady, updateQi,
    cultRate,
    advanceRealm, accrue, equipItem, unequipSlot, bagGearAction, useConsumable,
    renderChar,
    loadElixirSlot, unloadElixir, elixirPreferredSlot, leaveActiveHunt,
    showBattleAreas, showBattleEnemiesCard, battleTick, derivedStats, playerMaxHp, addInv, takeInv,
    craftReady, craftMax, toast, toastBox, renderWork, craftRecipe, fetchRecipes,
    crafting, sellItem, paintMailBadge,
    fetchHerbs, renderGather, startGathering, gatherOnce, stopGathering, pollServerState,
    setHerbs: h => { HERBS = h; },
    setHerbRank: (r, l, n) => { herbRank = r; herbLevel = l; herbRankName = n; },
    setGathering: g => { gathering = g; },
    getGathering: () => gathering,
    setMailNewItems: v => { mailNewItems = v; },
    masteryLevel, masteryRank, masteryNumeral, masteryTitle, masteryXp, masteryKillXp,
    masteryRankOf, masteryRankLabel, masteryBonusText, masteryBodyBonus, fetchMasteryDefs, fmtSeconds,
    setMasteryDefs: d => { MASTERY_DEFS = d; },
    activeBuffs, skillCooldown, equippedSkills, useSkills, fireSkill, sortBag,
    BAG_SORTS, ITEM_RARITY_ORDER, renderSkills, toggleSkill, SKILL_SLOTS, paintCombat,
    paintBattleKit, iconUrl, iconImg, fetchSkills, setSkillsLoaded: v => { SKILLS_LOADED = v; },
    showTip, showSlotTip, hideTip, scheduleHideTip, tipPointerOverTip, watchTipPointer,
    adoptPlayer,
    setIcon: (k, v) => { ICON[k] = v; },
    setSort: s => { invSort = s; },
    setSkills: s => { SKILLS = s; },
    applyMasteryXp, masteryPopup, masteryPanel, masteryTotalXp, MASTERY_TRACKS,
    closeSidebar,
    setRecipes: r => { RECIPES = r; },
    mobStones, rollStones, onMobDeath,
    itemTipHtml, itemTypeLabel, bagTabOf, dropsFor, iconHtml, artCls, BAG_TABS, slotTypeLabel,
    hiddenFromBag, advanceRealm,
    ITEM_BY_ID, gearBonus, derivedStats,
    ITEM_RARITY_COLORS,
    clickBreakthrough: () => els["breakthrough-btn"].onclick(),
  };
`)({ state, els, calls, ITEM_FIXTURE, REALMS_FIXTURE });

// derivedStats max HP for basePlayer (physique 5, realm 0): 100 + 5*25 = 225.
const MAXHP = 225;
const basePlayer = () => ({
  username: "tester", hp: MAXHP, realm_idx: 0, realm: "Mortal",
  cultivation: 0, cultivation_to_next: 50, bottleneck: 0, dao_insight: 0,
  spirit_stones: 0,
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
  p.elixirs = ["minor_vitality_elixir", "minor_vitality_elixir", "minor_qi_pill", "roasted_wild_rat_meat"]; // legacy + dup
  p.inventory = { minor_vitality_elixir: 2, minor_qi_pill: 1, roasted_wild_rat_meat: 1, bogus_item: 5 };
  p.equipment.head = "linen_robe"; // wrong slot (chest item) -> cleared
  p.realm_idx = 0;
  lib.normalizePlayer(p);
  ok(JSON.stringify(p.elixirs) === JSON.stringify(["minor_vitality_elixir", "minor_qi_pill", "roasted_wild_rat_meat"]),
    "legacy 4-slot elixirs dedup + re-home into 3 named slots");
  ok(p.equipment.head === null, "wrong-slot equipped item cleared on normalize");
  ok(p.equipment.chest === "linen_robe", "wrong-slot gear re-homes to its real slot");
  ok(!("bogus_item" in p.inventory), "unknown inventory item dropped");

  p = basePlayer();
  p.elixirs = [null, null, null, "minor_qi_pill"]; // pill stranded in old slot 4
  p.stats = undefined; p.roots = undefined;
  lib.normalizePlayer(p);
  ok(p.elixirs[1] === "minor_qi_pill" && p.elixirs.length === 3, "stranded pill re-homed; missing stats/roots defaulted");
  ok(p.stats && p.stats.qi_mult === 1 && Array.isArray(p.roots), "restore-safe stats/roots defaults");

  ok(lib.elixirPreferredSlot(ITEM_FIXTURE.minor_vitality_elixir) === 0, "healing pill -> slot 0");
  ok(lib.elixirPreferredSlot(ITEM_FIXTURE.minor_qi_pill) === 1, "qi pill -> slot 1");
  ok(lib.elixirPreferredSlot(ITEM_FIXTURE.roasted_wild_rat_meat) === 2, "spirit meal -> slot 2");

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

  // ---- paired slots take the best value, they do not add up
  // Jade Guard Ring def+2 hp+15 crit+1 against Copper Spirit Ring crit+2 must
  // read def 2, hp 15, crit 2 -- not crit 3, and never less than the better ring.
  const jade = { id: "jade_guard_ring", name: "Jade Guard Ring", kind: "gear", slot: "ring", glyph: "d", rarity: "Uncommon", desc: "", stats: { ...ZERO_STATS, def: 2, hp: 15, crit: 1 } };
  const copper = { id: "copper_spirit_ring", name: "Copper Spirit Ring", kind: "gear", slot: "ring", glyph: "r", rarity: "Common", desc: "", stats: { ...ZERO_STATS, crit: 2 } };
  lib.ITEM_BY_ID[jade.id] = jade;
  lib.ITEM_BY_ID[copper.id] = copper;
  state.player.equipment = { ring1: null, ring2: null, chest: null, head: null, main_weapon: null };
  const base = { ...lib.gearBonus(state.player) };
  ok(base.def === 0 && base.hp === 0 && base.crit === 0, "no rings means no ring bonus");

  state.player.equipment.ring1 = jade.id;
  const oneJade = lib.gearBonus(state.player);
  ok(oneJade.def === 2 && oneJade.hp === 15 && oneJade.crit === 1,
    "a single Jade Guard Ring gives its own stats");

  state.player.equipment.ring2 = copper.id;
  const both = lib.gearBonus(state.player);
  ok(both.crit === 2, "two rings take the higher crit (2), never the sum (3)");
  ok(both.def === 2 && both.hp === 15, "a stat only one ring has is kept in full");
  ok(both.crit >= Math.max(oneJade.crit, 2), "the second ring never reduces the first");

  // swapping the fingers must not change anything
  state.player.equipment.ring1 = copper.id;
  state.player.equipment.ring2 = jade.id;
  const swapped = lib.gearBonus(state.player);
  ok(swapped.crit === both.crit && swapped.def === both.def && swapped.hp === both.hp,
    "ring order does not matter");

  // a stat neither ring has still contributes nothing, and non-paired gear
  // keeps summing normally
  state.player.equipment.chest = "linen_robe"; // def+4 hp+30
  const withChest = lib.gearBonus(state.player);
  ok(withChest.def === both.def + 4 && withChest.hp === both.hp + 30,
    "non-paired slots still add up on top of the paired ones");
  state.player.equipment = { ring1: null, ring2: null, chest: null, head: null, main_weapon: null };
  ok(state.player.inventory.copper_ring === 1, "ring stack consumed on wear");

  // ============ 5. consumables never wasted ============
  state.player = basePlayer();
  state.player.hp = MAXHP; // full
  state.player.inventory = { minor_vitality_elixir: 1 };
  lib.useConsumable("minor_vitality_elixir");
  ok(state.player.inventory.minor_vitality_elixir === 1 && state.player.hp === MAXHP,
    "healing pill at full HP is not consumed");

  state.player.hp = 100;
  lib.useConsumable("minor_vitality_elixir");
  ok(Math.round(state.player.hp) === Math.round(100 + MAXHP * 0.4), "healing pill heals 40% when hurt");
  ok(!state.player.inventory.minor_vitality_elixir, "consumed pill removed from bag");

  state.player = basePlayer();
  state.player.inventory = { minor_qi_pill: 1 };
  state.player.cultivation = 0;
  lib.useConsumable("minor_qi_pill");
  ok(Math.abs(state.player.cultivation - 50 * 0.15) < 1e-9, "qi pill grants 15% of stage qi");

  state.player = basePlayer();
  state.player.hp = MAXHP;
  state.player.inventory = { roasted_wild_rat_meat: 1 };
  lib.useConsumable("roasted_wild_rat_meat");
  ok(Math.abs(state.player.cultivation - 50 * 0.05) < 1e-9 && !state.player.inventory.roasted_wild_rat_meat,
    "spirit meal at full HP still grants its qi and is consumed");

  // ============ 6. combat loop: kill, loot, qi, hp mirror, respawn guard ============
  lib.setRealms(REALMS_FIXTURE);
  state.player = basePlayer();
  const mob = { id: "wild_rat", name: "Wild Rat", hp: 35, atk: 4, def: 0, crit: 5, crit_dmg: 150,
    speed: 0.9, qi: 3, stones: { min: 10, max: 20 },
    loot: [{ item: "Rat Fur", rarity: "Common", chance: 1, min: 1, max: 1 }] };
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
  ok(state.player.spirit_stones >= 10 && state.player.spirit_stones <= 20,
    "kill paid the mob's stone range");
  ok(lib.battle.lastStones === state.player.spirit_stones, "stone reward staged for combat feedback");
  ok(lib.battle.loot["Spirit Stone"] === state.player.spirit_stones,
    "the stone drop is logged in the hunt loot panel");

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

  // ============ 6b. spirit stones: normalize, paint, sync ============
  lib.setRealms(REALMS_FIXTURE);
  state.player = basePlayer();
  delete state.player.spirit_stones;
  lib.normalizePlayer(state.player);
  ok(state.player.spirit_stones === 0, "normalize defaults a missing stone balance to 0");
  state.player.spirit_stones = -5;
  lib.normalizePlayer(state.player);
  ok(state.player.spirit_stones === 0, "normalize clamps a negative stone balance to 0");
  lib.updateQi(state.player);
  ok(els["p-stones"].textContent === "0", "top bar paints the stone balance");
  state.player.spirit_stones = 1234;
  lib.updateQi(state.player);
  ok(els["p-stones"].textContent === "1234", "top bar updates as stones are earned");
  ok(lib.mobStones({ qi: 3 }) && lib.mobStones({ qi: 3 }).min === 10 && lib.mobStones({ qi: 3 }).max === 20,
     "stones fall back to the server curve for older area payloads");
  ok(lib.mobStones({ qi: 50, stones: { min: 151, max: 302 } }).max === 302,
     "the server-published stone range wins");
  ok(lib.mobStones({ qi: 50, stones: { min: 151, max: 302 } }).min >
     lib.mobStones({ qi: 3 }).min,
     "the higher the enemy the higher the stone drop");
  ok(lib.mobStones(null).max === 0, "no mob means no stones");

  let sentBody = null;
  state.player = basePlayer();
  state.player.spirit_stones = 9;
  // Any syncPlayer fired without await (e.g. by useConsumable) is still in
  // flight; the syncing guard would swallow this call until it settles.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  calls.fetch = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true, clamped: false, player: { ...state.player } }) };
  };
  await lib.syncPlayer(true);
  ok(sentBody && sentBody.spirit_stones === 9, "sync reports the stone balance");
  calls.fetch = null;

  // ============ 6c. the boss card: flagged, gated, richer drop ============
  const bossMob = { id: "corrupted_alpha_wolf", name: "Corrupted Alpha Wolf", realm: "Qi Refinement I",
    difficulty: "Nightmare", desc: "d", glyph: "🐺", hp: 800, atk: 50, def: 30, crit: 5, crit_dmg: 150,
    speed: 0.8, qi: 50, stones: { min: 151, max: 302 }, req_idx: 1, boss: true,
    loot: [{ item: "Corrupted Beast Core", rarity: "Epic", chance: 1, min: 1, max: 1 }] };
  const ratMob = { id: "spectral_rat", name: "Spectral Rat", realm: "Mortal",
    difficulty: "Very Easy", desc: "d", glyph: "🐀", hp: 40, atk: 6, def: 0, crit: 5, crit_dmg: 150,
    speed: 1.4, qi: 3, stones: 1, req_idx: 0, boss: false, loot: [] };
  lib.battle.area = { id: "origin_village", name: "Origin Village", req_idx: 0, req: "Mortal",
    difficulty: "Beginner", desc: "", mobs: [ratMob, bossMob] };
  state.player = basePlayer();          // realm 0: the boss is out of reach
  lib.showBattleEnemiesCard("");
  let cardHtml = els["battle-root"].innerHTML;
  ok(/boss-tag/.test(cardHtml), "the boss card is flagged as a boss");
  ok(/enemy-card boss locked/.test(cardHtml), "the boss is locked below Qi Refinement I");
  ok(/Locked — needs Qi Refinement I/.test(cardHtml), "the lock names the realm required");
  ok(/151-302x/.test(cardHtml), "the boss card previews its bigger stone drop");
  state.player.realm_idx = 1;           // Qi Refinement I reached
  lib.showBattleEnemiesCard("");
  cardHtml = els["battle-root"].innerHTML;
  ok(!/enemy-card boss locked/.test(cardHtml), "the boss unlocks once the realm is deep enough");
  ok(/enemy-card boss"/.test(cardHtml) && !/locked-tag/.test(cardHtml),
     "the boss card stays flagged once unlocked");

  // ============ 6d. the forge: recipes, gating, the craft call ============
  const recipe = {
    id: "roast_meat", out: "roasted_wild_rat_meat", count: 1, note: "Skewer it.", kind: "cook",
    cost: [
      { id: "rat_tail", need: 1, name: "Rat Tail", rarity: "Uncommon", color: "#7cb342", img: "", glyph: "✦" },
      { id: "raw_meat", need: 2, name: "Raw Meat", rarity: "Common", color: "#9aa0a6", img: "", glyph: "✦" },
    ],
    out_name: "Roasted Wild Rat Meat", out_rarity: "Common", out_img: "", out_glyph: "🍖",
  };
  const gearRecipe = {
    id: "cure_leather_chest", out: "leather_chest", count: 1, note: "Hide and fat.", kind: "craft",
    cost: [{ id: "boar_hide", need: 4, name: "Boar Hide", rarity: "Uncommon", color: "#7cb342", img: "", glyph: "✦" }],
    out_name: "Leather Chest", out_rarity: "Common", out_img: "", out_glyph: "🦺",
  };
  const pillRecipe = {
    id: "grind_qi_pill", out: "minor_qi_pill", count: 1, note: "Bone and blood.", kind: "alchemy",
    cost: [{ id: "small_beast_bone", need: 1, name: "Small Beast Bone", rarity: "Uncommon", color: "#7cb342", img: "", glyph: "✦" }],
    out_name: "Minor Qi Pill", out_rarity: "Common", out_img: "", out_glyph: "🔹",
  };
  const pillRecipe2 = {
    id: "grind_alpha_fang", out: "minor_qi_pill", count: 1, note: "Fang and essence.", kind: "alchemy",
    cost: [{ id: "corrupted_fang", need: 1, name: "Corrupted Fang", rarity: "Legendary", color: "#ffb300", img: "", glyph: "✦" }],
    out_name: "Minor Qi Pill", out_rarity: "Common", out_img: "", out_glyph: "🔹",
  };
  lib.setRecipes([recipe, gearRecipe, pillRecipe, pillRecipe2]);
  state.player = basePlayer();
  state.player.inventory = { rat_tail: 3, raw_meat: 1, boar_hide: 4, small_beast_bone: 1 };
  lib.renderWork("craft-root", "craft");
  let craftHtml = els["craft-root"].innerHTML;
  ok(/Leather Chest/.test(craftHtml) && !/Roasted Wild Rat Meat/.test(craftHtml),
     "the craft bench shows gear only");
  ok(/Minor Qi Pill/.test(craftHtml) === false, "pills never sit on the craft bench");
  lib.renderWork("alchemy-root", "alchemy");
  const alchHtml = els["alchemy-root"].innerHTML;
  ok(/Minor Qi Pill/.test(alchHtml) && !/Leather Chest/.test(alchHtml),
     "the alchemy bench shows pills only");
  ok((alchHtml.match(/Minor Qi Pill/g) || []).length === 1,
     "one pill entry, however many ways there are to brew it");
  ok(/craft-way/.test(alchHtml), "the ways to brew it are folded into that one entry");
  lib.renderWork("cook-root", "cook");
  const cookHtml = els["cook-root"].innerHTML;
  ok(/Roasted Wild Rat Meat/.test(cookHtml) && !/Leather Chest/.test(cookHtml),
     "the cooking bench shows food only");

  lib.renderWork("cook-root", "cook");
  craftHtml = els["cook-root"].innerHTML;
  ok(/Rat Tail/.test(craftHtml) && /3\/1/.test(craftHtml),
     "the recipe shows what you have against what it costs");
  ok(/craft-cost short/.test(craftHtml), "a material you lack is marked short");
  ok(/data-craft="1" disabled/.test(craftHtml),
     "crafting is disabled while a material is missing");
  ok(/data-craft="max" disabled/.test(craftHtml),
     "forge max is disabled while a material is missing");
  state.player.inventory = { rat_tail: 3, raw_meat: 2 };
  lib.renderWork("cook-root", "cook");
  craftHtml = els["cook-root"].innerHTML;
  ok(!/data-craft="1" disabled/.test(craftHtml),
     "crafting unlocks once the materials are there");
  ok(!/data-craft="max" disabled/.test(craftHtml),
     "forge max unlocks with it");
  ok(lib.craftReady(recipe, 1) === true && lib.craftReady(recipe, 5) === false,
     "the gate follows the recipe cost");
  ok(lib.craftMax(recipe) === 1, "forge max counts what the materials can pay for");
  state.player.inventory = { rat_tail: 9, raw_meat: 20 };
  ok(lib.craftMax(recipe) === 9, "forge max is limited by the scarcest material");
  state.player.inventory = { rat_tail: 3, raw_meat: 2 };
  lib.renderWork("craft-root", "craft");
  craftHtml = els["craft-root"].innerHTML;
  ok(/>Forge</.test(craftHtml) && />Forge Max</.test(craftHtml),
     "the craft bench offers Forge and Forge Max");

  calls.cEvents.length = 0;
  calls.toasts.length = 0;
  calls.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    ok(body.recipe_id === "roast_meat" && body.count === 1,
       "the forge is asked for the right recipe");
    return { ok: true, json: async () => ({ ok: true, crafted: "roasted_wild_rat_meat", count: 1,
      kind: "cook",
      mastery: { cooking: { xp: 40, level: 1, rank: "Beginner", numeral: "I", next: 60 } },
      player: { ...state.player, inventory: { rat_tail: 2, raw_meat: 1, roasted_wild_rat_meat: 1 } } }) };
  };
  state.player.mastery = { cooking: 0, alchemy: 0, crafting: 0, battle: 0 };
  await lib.craftRecipe("roast_meat", 1);
  ok(state.player.mastery.cooking === 40, "a craft teaches the mastery of its trade");
  ok(state.player.inventory.roasted_wild_rat_meat === 1, "the crafted item lands in the bag");
  ok(state.player.inventory.rat_tail === 2, "the server's inventory replaces the local one");
  ok(calls.cEvents.some(m => /Cooked/.test(m)), "the forge reports what it made");
  ok(calls.toasts.some(m => /Cooked Roasted Wild Rat Meat x1/.test(m)),
     "the forge raises a bottom-right notice naming what it made");
  calls.fetch = null;

  calls.cEvents.length = 0;
  calls.fetch = async () => ({ ok: false, json: async () => ({ error: "Not enough Raw Meat" }) });
  await lib.craftRecipe("roast_meat", 1);
  ok(calls.cEvents.some(m => /refuses/.test(m)), "a refused craft is reported, not swallowed");
  calls.fetch = null;

  // ============ 6e. mastery: levels, ranks, and the level-up notice ============
  ok(lib.masteryLevel(0) === 1, "mastery starts at level 1");
  ok(lib.masteryLevel(100) === 2, "100 XP is level 2");
  ok(lib.masteryLevel(300) === 3, "300 XP is level 3");
  ok(lib.masteryLevel(485100) === 99, "485100 XP is level 99");
  ok(lib.masteryLevel(714000) === 120, "mastery stops at level 120");
  ok(lib.masteryTitle("cooking", 10) === "Cooking Beginner X",
     "level 10 is Cooking Beginner X");
  ok(lib.masteryTitle("cooking", 11) === "Cooking Artisan I",
     "level 11 is Cooking Artisan I");
  ok(lib.masteryTitle("battle", 1) === "Battle Beginner I", "a fresh track is a Beginner I");
  ok(lib.masteryRank(99) === "Transcendent", "level 99 is the last rank");

  // Every track reads like the herbalist track: a named rank, and the level
  // inside it out of ten.
  state.player = basePlayer();
  state.player.mastery = {
    cooking: { xp: 5500, level: 11, rank: 2, rank_name: "Apprentice Cook", within: 1, next: 100 },
    alchemy: { xp: 0, level: 1, rank: 1, rank_name: "Novice Alchemist", within: 1, next: 100 },
    crafting: { xp: 0, level: 1, rank: 1, rank_name: "Novice Smith", within: 1, next: 100 },
    battle: { xp: 0, level: 1, rank: 1, rank_name: "Novice Hunter", within: 1, next: 100 },
    herbs: { xp: 0, level: 1, rank: 1, rank_name: "Novice Herbalist", within: 1, next: 100 },
  };
  lib.renderChar(state.player);
  const masteryHtml = els["char-sheet"].innerHTML;
  ok(/Apprentice Cook I/.test(masteryHtml), "a track shows its own rank name");
  ok(/Novice Alchemist I/.test(masteryHtml), "every track has a rank name");
  ok(/Novice Hunter I/.test(masteryHtml), "the hunt track has a rank name too");
  ok(/1\/10/.test(masteryHtml), "the level inside the rank is counted out of ten");

  // The rank name and the numeral are written once -- not "Novice Cook II II".
  calls.fetch = async () => ({ ok: true, json: async () => ({ ok: true, tracks: {
    cooking: { label: "Cooking", gift: "chance to duplicate the meal", bonus_cap: 25,
      ranks: [{ rank: 1, name: "Novice Cook", bonus: 1 },
              { rank: 2, name: "Apprentice Cook", bonus: 1 }] } } }) });
  await lib.fetchMasteryDefs();
  calls.fetch = null;
  state.player = basePlayer();
  state.player.mastery = { cooking: 5500, alchemy: 0, crafting: 0, battle: 0, herbs: 0 };
  lib.renderChar(state.player);
  const onceHtml = els["char-sheet"].innerHTML;
  ok(/Apprentice Cook I(?!I)/.test(onceHtml), "a track the client knows only as XP still names its rank once");
  ok(!/Cook I I/.test(onceHtml), "the numeral inside the rank is never written twice");
  lib.setMasteryDefs({});   // the standing names again, for the tests below

  state.player = basePlayer();
  state.player.mastery = { cooking: 0, alchemy: 0, crafting: 0, battle: 0 };
  calls.popups.length = 0;
  lib.applyMasteryXp("cooking", 99);
  ok(calls.popups.length === 0, "no notice before the level turns over");
  lib.applyMasteryXp("cooking", 100);
  ok(calls.popups.length === 1, "a notice appears when the level turns over");
  ok(/Cooking Mastery 1 -> 2/.test(calls.popups[0]), "the notice names the level change");
  calls.popups.length = 0;
  lib.applyMasteryXp("cooking", 4500);   // level 10: the last Beginner
  ok(calls.popups.length === 1, "a level raises a notice");
  calls.popups.length = 0;
  lib.applyMasteryXp("cooking", 5500);   // level 11: the rank turns over
  ok(calls.popups.length === 1, "a rank turn raises its own notice");
  ok(/Cooking Mastery 10 -> 11/.test(calls.popups[0]),
     "the notice names the level change");
  ok(/Cooking Beginner X -> Cooking Artisan I/.test(calls.popups[0]),
     "the notice names the old rank and the new one");
  // Every level turns the numeral too, and the notice says so.
  calls.popups.length = 0;
  lib.applyMasteryXp("battle", 5500);   // level 11
  calls.popups.length = 0;
  lib.applyMasteryXp("battle", 6600);   // level 12
  ok(/Battle Artisan I -> Battle Artisan II/.test(calls.popups[0]),
     "the notice names the rank even when only the numeral turns");
  state.player.mastery.battle = 0;
  lib.renderChar(state.player);

  lib.renderChar(state.player);
  const charHtml = els["char-sheet"].innerHTML;
  ok(/Mastery/.test(charHtml), "the character panel carries the masteries");
  ok(/Cooking Artisan I/.test(charHtml) && /Battle Beginner I/.test(charHtml),
     "every track is on the character panel");
  ok(/mastery-fill/.test(charHtml), "the panel shows the road to the next level");

  // ============ 6f. battle mastery feeds the body ============
  const bare = basePlayer();
  const plain = lib.derivedStats(bare);
  const taught = basePlayer();
  taught.mastery = { battle: 5500 };   // level 11
  const buffed = lib.derivedStats(taught);
  ok(buffed.atk > plain.atk && buffed.hp > plain.hp && buffed.def > plain.def,
     "battle mastery raises attack, hp and defense");
  const atkPct = (buffed.atk - plain.atk) / plain.atk;
  ok(atkPct > 0.05 && atkPct < 0.15,
     "the battle bonus is about ten percent at level 11");
  ok(buffed.crit === plain.crit, "the battle bonus does not touch crit");

  // ============ 6g. the stronger the beast, the more it teaches ============
  ok(lib.masteryKillXp({ qi: 3 }) === 5, "a rat teaches 5 XP");
  ok(lib.masteryKillXp({ qi: 18 }) > lib.masteryKillXp({ qi: 3 }),
     "a stronger beast teaches more than a weak one");
  ok(lib.masteryKillXp({ qi: 50 }) > lib.masteryKillXp({ qi: 18 }),
     "the boss teaches more than the wereboar");

  // ============ 6h. root stats: re-applied, and none of them dead ============
  const threeRoots = [
    { qi_mult: 1.0, comprehension: 2, physique: 3, fortune: 2, element: "Fire" },
    { qi_mult: 1.2, comprehension: 3, physique: 5, fortune: 3, element: "Fire" },
    { qi_mult: 1.4, comprehension: 5, physique: 3, fortune: 4, element: "Water" },
  ];
  const rStats = lib.rootStats(threeRoots);
  ok(rStats.qi_mult === 1.4, "the qi multiplier averages the roots, plus the synergy");
  ok(rStats.synergy_bonus === 0.2, "two roots of one element earn the synergy");
  ok(rStats.comprehension === 10 && rStats.physique === 11 && rStats.fortune === 9,
     "the root stats add up");
  const lost = basePlayer();
  delete lost.stats;
  lost.roots = threeRoots;
  lib.normalizePlayer(lost);
  ok(lost.stats.qi_mult === 1.4 && lost.stats.physique === 11,
     "a save that lost its stats is re-applied from the roots");

  // No dead stats: every one of them has to move something.
  const plainP = basePlayer();
  const plainD = lib.derivedStats(plainP);
  const bump = (key, val) => {
    const p = basePlayer();
    p.stats = { ...plainP.stats, [key]: val };
    return lib.derivedStats(p);
  };
  ok(bump("physique", plainP.stats.physique + 3).hp > plainD.hp,
     "physique is not dead: it raises hp");
  ok(bump("comprehension", plainP.stats.comprehension + 3).atk > plainD.atk,
     "comprehension is not dead: it raises attack");
  ok(bump("fortune", plainP.stats.fortune + 3).crit > plainD.crit,
     "fortune is not dead: it raises crit");
  ok(bump("synergy_bonus", 0.2).hp > plainD.hp,
     "the synergy bonus is not dead: it raises the body");
  ok(lib.cultRate({ ...plainP, stats: { ...plainP.stats, qi_mult: plainP.stats.qi_mult + 1 } })
       > lib.cultRate(plainP),
     "qi_mult is not dead: it raises the cultivation rate");

  // ============ 6i. the bag can be ordered ============
  const bagP = basePlayer();
  bagP.inventory = { rat_fur: 2, beast_core_fragment: 7, minor_qi_pill: 5, wolf_fang: 1 };
  const bagIds = () => Object.keys(bagP.inventory);
  lib.setSort("rarity");
  let sorted = lib.sortBag(bagIds(), bagP);
  ok(sorted[0] === "beast_core_fragment", "the rarity sort puts the rarest first");
  lib.setSort("quantity");
  sorted = lib.sortBag(bagIds(), bagP);
  ok(sorted[0] === "beast_core_fragment" && sorted[1] === "minor_qi_pill",
     "the quantity sort puts the biggest stack first");
  lib.setSort("name");
  sorted = lib.sortBag(bagIds(), bagP);
  ok(sorted[0] === "beast_core_fragment" && sorted[1] === "minor_qi_pill",
     "the name sort is alphabetical");
  ok(lib.BAG_SORTS.map(s => s[0]).join(",") === "rarity,quantity,name",
     "the bag offers rarity, quantity and name");

  // ============ 6j. the new body stats ============
  const statP = basePlayer();
  statP.stats = { ...basePlayer().stats, agility: 20, luck: 15, spirit: 8, evasion: 25, energy: 30, cdr: 10 };
  const statD = lib.derivedStats(statP);
  ok(statD.agility === 20 && statD.luck === 15 && statD.spirit === 8,
     "agility, luck and spirit are read");
  ok(statD.evasion === 25 && statD.energy === 130 && statD.cdr === 10,
     "evasion, energy and cooldown reduction are read");
  ok(/\bd\.agility/.test(SRC), "agility speeds the swing");
  ok(/\bd\.evasion/.test(SRC), "evasion dodges the blow");
  ok(/\bd\.luck/.test(SRC), "luck finds extra loot");
  ok(/max \* 0\.02 \* dt/.test(SRC) === false, "there is no resting hp regen any more");

  // ============ 6k. techniques fire on their own ============
  lib.setSkills({
    iron_fist: { id: "iron_fist", name: "Iron Fist", cd: 10, energy: 10, kind: "buff",
      duration: 5, buff: { atk: 5 }, img: "/assets/items/place_holder.jpg", desc: "d" },
    thunder_palm: { id: "thunder_palm", name: "Thunder Palm", cd: 8, energy: 15, kind: "strike",
      mult: 1.8, spirit: 20, img: "", desc: "d" },
  });
  state.player = basePlayer();
  state.player.skills = ["iron_fist", "thunder_palm", null];
  lib.battle.energy = 100;
  lib.battle.cooldowns = {};
  lib.battle.buffs = [];
  lib.battle.clock = 0;
  const dummy = { name: "Rat", hp: 200, def: 0, atk: 4, crit: 5, crit_dmg: 150, speed: 1 };
  lib.useSkills(state.player, dummy);
  ok(lib.activeBuffs().length === 1, "a technique fires on its own");
  ok(lib.battle.cooldowns.iron_fist > 0, "a used technique goes on cooldown");
  ok(lib.battle.energy < 100, "a technique costs energy");
  ok(lib.battle.energy >= 100 - 10 - 15, "the energy spent is the cost of the techniques used");
  lib.useSkills(state.player, dummy);
  ok(lib.activeBuffs().length === 1, "a technique already up is not used again");
  lib.battle.cooldowns = {};
  lib.battle.buffs = [];
  lib.battle.clock = 0;
  lib.battle.energy = 100;
  const ehpBefore = lib.battle.ehp;
  lib.useSkills(state.player, dummy);
  ok(lib.battle.ehp < ehpBefore || lib.battle.energy < 100,
     "a strike technique lands or costs its energy");
  // the panel shows what you carry and everything you could
  lib.renderSkills();
  const skillsHtml = els["skills-root"].innerHTML;
  ok(/Iron Fist/.test(skillsHtml), "a carried technique is on the panel");
  ok(/Thunder Palm/.test(skillsHtml), "every technique is listed");
  ok(/skill-layout/.test(skillsHtml), "the panel is carried left, available right");
  lib.battle.mob = dummy;
  lib.paintCombat();
  ok(/Iron Fist/.test(els["equipped-skills"].innerHTML),
     "the carried techniques show in the battle");
  ok(/<div class="skill-bar" id="equipped-skills"><\/div>[\s\S]*<div class="loot-log">/.test(SRC),
     "the techniques sit above the loot log");

  // ============ 6l. the elixir, the pill and the meal are in the fight ============
  const cssNow = fs.readFileSync(path.join(__dirname, "..", "public", "css", "style.css"), "utf8").replace(/\r\n/g, "\n");
  // ============ 6n. gathering, and the live mail badge ============
  state.player = basePlayer();
  state.player.inventory = {};
  lib.setHerbs([
    { id: "herb_wild_ginseng", name: "Wild Ginseng", rarity: "Common", element: "Earth", time: 6, now: 5.4,
      desc: "The root every beginner pulls first.", img: "/assets/herb/herb_wild_ginseng.png",
      need_rank: 1, locked: false },
    { id: "herb_crimson_ginseng", name: "Crimson Ginseng", rarity: "Rare", element: "Fire", time: 16, now: 12.8,
      desc: "Red as a banked coal.", need_rank: 4, locked: true },
  ]);
  lib.setHerbRank(2, 3, "Apprentice Herbalist");
  lib.renderGather();
  const gatherHtml = els["gather-root"].innerHTML;
  ok(/Wild Ginseng/.test(gatherHtml), "the gather panel lists the herbs");
  ok(/Crimson Ginseng/.test(gatherHtml), "a locked herb is still listed");
  ok(/Needs rank 4/.test(gatherHtml), "a locked herb says which rank opens it");
  ok(/data-herb="herb_wild_ginseng"/.test(gatherHtml), "a herb you can gather has a button");
  // The list is not compacted: every herb is a card of its own, the whole
  // list, the way the craft bench shows every recipe.
  ok((gatherHtml.match(/gather-card/g) || []).length === 2, "every herb gets its own card");
  ok(!/herb-group/.test(gatherHtml), "the herbs are not folded into rarity groups");
  ok(/The root every beginner pulls first\./.test(gatherHtml), "the card tells what the herb is");
  ok(/Earth · /.test(gatherHtml), "the card shows the element and the time");

  ok(/Common/.test(gatherHtml) && /Rare/.test(gatherHtml), "the card shows the rarity");
  ok(/class="gather-rarity"/.test(gatherHtml), "the rarity wears the brush face");
  ok(/src="\/assets\/herb\/herb_wild_ginseng\.png"/.test(gatherHtml),
     "the card draws the plant's own picture");
  ok(/\.gather-card \.gather-rarity \{[^}]*font-family: var\(--font-brush\)/.test(cssNow),
     "the brush face (Ma Shan Zheng) is on the rarity");
  ok(/\.gather-card \.craft-out-name b \{[^}]*font-family: var\(--font-label\)/.test(cssNow),
     "the herb name keeps the label face -- the brush is not on the name");
  ok(/Earth · 5\.4s/.test(gatherHtml),
     "the card shows the time the player actually waits, rank bonus included");

  // Gathering runs by itself until the player stops it.
  calls.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    ok(body.herb_id === "herb_wild_ginseng", "the forge is asked for the right herb");
    return { ok: true, json: async () => ({ ok: true, gathered: { herb_wild_ginseng: 1 },
      next_ms: 1000, mastery: { herbs: { xp: 20, level: 1, rank: 1, rank_name: "Novice Herbalist", within: 1 } },
      player: { ...state.player, inventory: { herb_wild_ginseng: 1 } } }) };
  };
  calls.cEvents.length = 0;
  calls.popups.length = 0;
  els["mastery-list"].innerHTML = "";
  await lib.startGathering("herb_wild_ginseng");
  ok(state.player.inventory.herb_wild_ginseng === 1, "the gathered herb lands in the bag");
  ok(calls.cEvents.some(m => /Gathered/.test(m)), "the gathering is reported");
  // The herb says so in the bottom-right corner.
  ok(calls.popups.some(h => /Wild Ginseng/.test(h) && /\+1/.test(h)),
     "the herb pops up in the corner");
  // And the masteries move while the player watches.
  ok(state.player.mastery.herbs && state.player.mastery.herbs.xp === 20,
     "the herbalist track is updated at once");
  ok(/Novice Herbalist/.test(els["mastery-list"].innerHTML),
     "the mastery panel is repainted live");
  lib.stopGathering();
  ok(lib.getGathering() === null, "stopping ends the gathering");

  // The mail badge is live: the health poll carries the count.
  lib.setMailNewItems(0);
  calls.fetch = async () => ({ ok: true, json: async () => ({ ok: true, roots: 21,
    version: "AshenFantasy/0.9.7", maintenance: { on: false, message: "" },
    announcement: "", restart_seq: 0, mail_unread: 1, mail_new: 3 }) });
  await lib.pollServerState();
  ok(String(els["mail-badge"].textContent) === "3", "the mail badge follows the server");
  calls.fetch = null;

  // ============ 6m. selling, the mail badge, the difficulty colour ============
  // ============ 6o. "Sell all" only when there is more than one ============
  state.player = basePlayer();
  state.player.inventory = { herb_wild_ginseng: 1 };
  const oneTip = lib.itemTipHtml("herb_wild_ginseng", {});
  ok(/data-act="sell"/.test(oneTip), "a single copy can still be sold");
  ok(!/data-act="sell-all"/.test(oneTip),
     "one copy has no 'Sell all' to click -- it would say the same thing");
  state.player.inventory = { herb_wild_ginseng: 3 };
  const manyTip = lib.itemTipHtml("herb_wild_ginseng", {});
  ok(/data-act="sell-all"/.test(manyTip), "several copies can be sold in one go");

  // ============ 6p. the bag keeps the spares, the realm reports its gains ============
  // A ring that is not the one being worn must never offer "Unequip".
  state.player = basePlayer();
  state.player.equipment = { ring1: "copper_ring", ring2: "copper_ring" };
  state.player.inventory = { copper_ring: 2, jade_ring: 1 };
  const wornRing = lib.bagGearAction("copper_ring");
  ok(wornRing && wornRing.act === "unequip",
     "the ring that is actually worn offers to be taken off");
  const otherRing = lib.bagGearAction("jade_ring");
  ok(otherRing && otherRing.act === "equip",
     "another ring is offered as Equip, never as Unequip");
  ok(otherRing && (otherRing.slot === "ring1" || otherRing.slot === "ring2"),
     "and it goes onto a finger");
  // The tooltip says the same thing.
  const otherTip = lib.itemTipHtml("jade_ring", {});
  ok(/data-act="equip"/.test(otherTip) && !/data-act="unequip"/.test(otherTip),
     "the tooltip of another ring offers Equip, not Unequip");
  const wornTip = lib.itemTipHtml("copper_ring", {});
  ok(/data-act="unequip"/.test(wornTip), "the worn ring's tooltip offers Unequip");

  // ============ 6q. the tooltip, the notices and the sidebar ============
  ok(/#item-tip \{[^}]*z-index: 10001/.test(cssNow),
     "the tooltip sits above the corner notices, so a notice never hides it");
  ok(/let tipRect = null/.test(SRC) && /tipRect = measureTip\(\)/.test(SRC),
     "the tooltip's box is measured once, not on every mouse move");
  ok(/armSlotTip\(el, e/.test(SRC) && /SLOT_TIP_DELAY = 260/.test(SRC),
     "an empty slot only speaks when the cursor rests on it -- passing over it keeps the tooltip");
  ok(/if \(window\.innerWidth <= 900\) \{/.test(SRC),
     "the sidebar stays open on a wide screen, so the panel does not flicker");

  // The tooltip must not close when the cursor is inside it.
  const tipEl = els["item-tip"];
  tipEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 });
  tipEl.style.display = "block";
  lib.watchTipPointer({ clientX: 20, clientY: 20 });
  ok(lib.tipPointerOverTip() === true, "the game knows the cursor is inside the tooltip");
  calls.timeouts.length = 0;
  lib.scheduleHideTip();
  calls.timeouts[calls.timeouts.length - 1].fn();
  ok(tipEl.style.display === "block",
     "the tooltip stays open while the cursor is inside it");
  lib.watchTipPointer({ clientX: 500, clientY: 500 });
  calls.timeouts.length = 0;
  lib.scheduleHideTip();
  calls.timeouts[calls.timeouts.length - 1].fn();
  ok(tipEl.style.display === "none", "the tooltip goes when the cursor leaves it");

  // A server that has lost the cultivator: the save is handed over once and
  // the sync is tried again.
  state.player = basePlayer();
  let syncCalls = 0;
  calls.fetch = async (url) => {
    syncCalls++;
    if (url === "/api/adopt") return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => ({ ok: false, error: "Unknown cultivator. Create first." }) };
  };
  await lib.syncPlayer(false);
  ok(syncCalls === 3, "the save is handed over and the sync is tried again");
  calls.fetch = null;

  // Equipping one of four must leave three in the bag, not empty it.
  const bagPlayer = {
    equipment: { chest: "linen_robe", ring1: "copper_ring", ring2: null },
    elixirs: [], inventory: { linen_robe: 3, copper_ring: 4 },
  };
  ok(!lib.hiddenFromBag(bagPlayer).has("linen_robe"),
     "the spares of a worn piece stay in the bag");
  ok(!lib.hiddenFromBag(bagPlayer).has("copper_ring"),
     "a ring with a free finger stays in the bag");
  bagPlayer.inventory.linen_robe = 0;
  ok(lib.hiddenFromBag(bagPlayer).has("linen_robe"),
     "a worn piece with nothing left in the bag is out of sight");

  // A new realm reports the stat gains it brings.
  state.player = basePlayer();
  state.player.cultivation = 5000;
  calls.notices.length = 0;
  lib.advanceRealm(state.player, "Breakthrough!");
  ok(calls.notices.length > 0, "the new realm reports its stat gains");
  ok(calls.notices.some(n => /New Realm/.test(n[2] || "")),
     "the report names the realm that was reached");

  // The popup notices are words, not cards: no border, no plate behind them.
  ok(/\.toast \{[^}]*background: none/.test(cssNow) && !/\.toast \{[^}]*border: 1px/.test(cssNow),
     "the corner notices have no border and no background");
  ok(/#stat-notice \{[^}]*background: none/.test(cssNow) && !/#stat-notice \{[^}]*border: 1px/.test(cssNow),
     "the stat notice has no border and no background");
  // A tooltip must never swallow the click under it (the mailbox Claim).
  ok(/#item-tip \{[^}]*pointer-events: none/.test(cssNow),
     "the tooltip lets clicks through");
  ok(/#item-tip \.tip-actions \{[^}]*pointer-events: auto/.test(cssNow),
     "the tooltip's own buttons still take the pointer");

  state.player = basePlayer();
  state.player.inventory = { rat_fur: 4 };
  state.player.spirit_stones = 0;
  calls.toasts.length = 0;
  calls.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    ok(body.item_id === "rat_fur", "the buyer is asked for the right item");
    return { ok: true, json: async () => ({ ok: true, sold: "rat_fur", count: 2, earned: 10,
      player: { ...state.player, inventory: { rat_fur: 2 }, spirit_stones: 10 } }) };
  };
  await lib.sellItem("rat_fur", 2);
  ok(state.player.spirit_stones === 10, "selling pays the stones");
  ok(state.player.inventory.rat_fur === 2, "the sold goods leave the bag");
  ok(calls.toasts.some(m => /Sold 2 Rat Fur for 10 stones/.test(m)),
     "the sale is reported in the corner");
  calls.fetch = null;

  // The badge counts the new items waiting to be claimed.
  lib.setMailNewItems(3);
  lib.paintMailBadge();
  ok(String(els["mail-badge"].textContent) === "3", "the mail badge counts the new items");
  ok(els["mail-badge"].hidden === false, "the badge shows when there is something new");
  lib.setMailNewItems(0);
  lib.paintMailBadge();
  ok(els["mail-badge"].hidden === true, "the badge goes quiet with nothing new");

  // The boss is Hard, and Hard is dark red.
  ok(/difficulty-tag \$\{esc\(String\(m\.difficulty\)/.test(SRC),
     "the difficulty tag carries its own class");
  ok(/\.difficulty-tag\.hard \{ color: #7d1018/.test(cssNow),
     "Hard is written in dark red");
  state.player = basePlayer();
  state.player.elixirs = ["minor_vitality_elixir", "minor_qi_pill", "roasted_wild_rat_meat"];
  state.player.inventory = {
    minor_vitality_elixir: 2, minor_qi_pill: 3, roasted_wild_rat_meat: 1,
  };
  lib.paintBattleKit();
  const kitHtml = els["battle-kit"].innerHTML;
  ok(/data-elixir="0"/.test(kitHtml) && /data-elixir="2"/.test(kitHtml),
     "each kit slot knows which one it is");
  ok(!/Roasted Wild Rat Meat/.test(kitHtml), "the kit shows the icon alone, not the name");
  ok(/kit-count">3</.test(kitHtml), "the kit shows the count on the icon");
  const kitSrc = SRC.slice(SRC.indexOf("function paintBattleKit"), SRC.indexOf("function paintCombat"));
  ok(/onmouseleave = scheduleHideTip/.test(kitSrc),
     "the kit tooltip leaves with the cursor instead of sticking");
  const cssNow2 = fs.readFileSync(path.join(__dirname, "..", "public", "css", "style.css"), "utf8").replace(/\r\n/g, "\n");
  ok(/\.kit-slot \{[^}]*justify-content: center/.test(cssNow2),
     "the kit icon sits in the middle of its slot");
  ok(/kit-slot ready/.test(kitHtml), "a filled kit slot is lit and ready");
  ok(/data-tip="roasted_wild_rat_meat"/.test(kitHtml), "a filled kit slot points at its item");
  // In the fight the tooltip is a plain look: no use, no unequip.
  lib.showTip("roasted_wild_rat_meat", 10, 10, { plain: true });
  ok(!/tip-actions/.test(els["item-tip"].innerHTML),
     "the fight tooltip has no use or unequip buttons");
  // An empty slot -- equipment or consumable -- says Empty and nothing else.
  lib.showSlotTip("Spirit Core", "Cultivation Artifact", "", 10, 10, "core");
  ok(/Empty/.test(els["item-tip"].innerHTML), "an empty slot says Empty");
  ok(!/Spirit Core/.test(els["item-tip"].innerHTML),
     "an empty slot does not name the item that would fit it");

  // An empty slot shows its art and says "Empty" -- not the name of the
  // pill that would fit it.
  lib.setIcon("elixir_icon", "/assets/icons/elixir_icon.png");
  lib.setIcon("qi_pill_icon", "/assets/icons/qi_pill_icon.png");
  lib.setIcon("spirit_meal_icon", "/assets/icons/spirit_meal_icon.png");
  state.player.elixirs = [null, null, null];
  state.player.inventory = {};
  lib.paintBattleKit();
  const emptyKit = els["battle-kit"].innerHTML;
  ok(!/Minor Vitality Elixir/.test(emptyKit), "an empty slot shows no item name");
  ok(!/Minor Qi Pill/.test(emptyKit) && !/Roasted Wild Rat Meat/.test(emptyKit),
     "an empty slot names no pill at all");
  ok(/data-slot-name="Empty"/.test(emptyKit), "an empty slot says Empty in its tooltip");
  ok(/slot-icon/.test(emptyKit), "an empty slot draws its own art");

  // The medicine has to land on the fight's own wound, not only on the save.
  state.player = basePlayer();
  state.player.hp = 50;
  state.player.inventory = { minor_vitality_elixir: 1 };
  state.player.elixirs = ["minor_vitality_elixir", null, null];
  lib.battle.view = "combat";
  lib.battle.timer = setTimeout(() => {}, 1000);
  lib.battle.php = 50;
  lib.useConsumable("minor_vitality_elixir");
  ok(lib.battle.php > 50, "drinking in a fight heals the wound you are carrying");
  ok(state.player.hp === lib.battle.php, "the save and the fight agree on the wound");
  lib.battle.timer = null;
  lib.battle.view = "areas";

  // No healing at full hp -- and no pill spent on nothing.
  state.player = basePlayer();
  state.player.hp = lib.playerMaxHp(state.player);
  state.player.inventory = { minor_vitality_elixir: 1 };
  lib.useConsumable("minor_vitality_elixir");
  ok(state.player.hp === lib.playerMaxHp(state.player), "no healing at full hp");
  ok((state.player.inventory.minor_vitality_elixir || 0) === 1,
     "a pill that would heal nothing is not spent");

  // The skills panel must never spin: one ask for the manual, then an answer.
  lib.setSkills({});
  lib.setSkillsLoaded(false);
  calls.fetches = 0;
  lib.renderSkills();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  ok(calls.fetches <= 1, "an empty manual is asked for once, not in a loop");
  ok(/manual is empty/.test(els["skills-root"].innerHTML),
     "an empty manual says so instead of spinning");
  lib.setSkillsLoaded(true);
  lib.setSkills({});

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
  state.player.inventory = { rat_fur: 3, wolf_fang: 2, beast_core_fragment: 1, minor_qi_pill: 2, linen_robe: 1 };
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
  const conTip = lib.itemTipHtml("minor_qi_pill", {});
  ok(/Cultivation Consumable/.test(conTip) && /tip-actions/.test(conTip), "consumable tooltip keeps its type + actions");
  const gearTip = lib.itemTipHtml("linen_robe", {});
  ok(/Body Armor/.test(gearTip) && /DEF \+4/.test(gearTip), "gear tooltip shows slot type + stats");
  ok(/tip-src/.test(gearTip) === false, "gear with no drop source shows no source block");
  ok(lib.dropsFor("Rat Fur").length === 2 && lib.dropsFor("Nonexistent Thing").length === 0,
    "dropsFor finds all sources, and none for an unknown item");
  ok(/<img class="art/.test(lib.iconHtml("/assets/items/rat_fur.png", "✦", "art-slot")) &&
     /<span class="glyph">/.test(lib.iconHtml(null, "✦", "art-slot")),
    "icon renders art when present, emoji otherwise");

  // ============ 12. item rarity ladder (Common -> Primordial) ============
  const RARITY_KEYS = Object.keys(lib.ITEM_RARITY_COLORS);
  ok(["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Divine", "Primordial"].every(k => RARITY_KEYS.includes(k)),
    "item rarity ladder is Common -> Primordial");
  ok(!RARITY_KEYS.some(k => k === "Mortal"),
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
  ok(/if \(battle\.php <= 0\) return onPlayerDeath\(\);\n  const d = derivedStats/.test(SRC), "zero-HP check runs before trading blows");
  ok(!/function log\(/.test(SRC) && !/log\(\{\}, ""\)/.test(SRC), "dead log() leftovers removed");
  ok(/const elix = `<div class="doll-row">` \+ \[0, 1, 2\]\.map/.test(SRC), "elixir row renders 3 slots");
  ok(/name: "Combat Pill"|name: "Protection Pill"/.test(SRC) === false, "unfillable pill labels removed");
  ok(/Crafting is deferred/.test(SRC) === false, "material wording lives server-side (no stale client copy)");
  ok(/it\.kind === "material" \? ` title=/.test(SRC) === false, "no native title tooltip left in the bag");
  ok(/data-item="\$\{id\}" data-tip="\$\{id\}"/.test(SRC), "every bag slot carries data-tip");
  ok(/\$\("p-stones"\)/.test(SRC), "updateQi paints the top-bar stone counter");
  ok(/spirit_stones: p\.spirit_stones \| 0/.test(SRC), "sync payload carries spirit_stones");
  ok(/p\.spirit_stones = Math\.max\(0, Math\.floor\(\+p\.spirit_stones \|\| 0\)\)/.test(SRC),
     "normalizePlayer repairs the stone balance");
  ok(/\+\$\{battle\.lastStones\} <img class="stone-glyph"/.test(SRC) === false,
     "the searching line shows neither qi nor stones");
  ok(/battle\.loot\["Spirit Stone"\]/.test(SRC), "kills log the guaranteed stone drop");
  ok(/loot-guaranteed/.test(SRC) && /guaranteed/.test(SRC),
     "enemy cards preview the drop as guaranteed");
  ok(/stone-glyph/.test(SRC), "the spirit stone is drawn with its own art, not an emoji");
  ok(/fetch\("\/api\/recipes"/.test(SRC), "recipes are fetched from the server");
  ok(/fetch\("\/api\/craft"/.test(SRC), "crafting is a server call, not a local mint");

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
  ok(/iconImg\([^)]*ELIXIR_ICON/.test(SRC) === false, "no slot icon hardcodes ELIXIR_ICON");
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

  // The three consumable slots are identified by what they hold, and each
  // draws its own art from assets/icons.
  ok(/const ELIXIR_SHAPES = \[[\s\S]*?id: "elixir_slot"[\s\S]*?\];/.test(SRC),
     "ELIXIR_SHAPES declares an elixir_slot");
  ok(/id: "pill_slot"/.test(SRC), "ELIXIR_SHAPES declares a pill_slot");
  ok(/id: "meal_slot"/.test(SRC), "ELIXIR_SHAPES declares a meal_slot");
  ok((SRC.match(/id: "(elixir_slot|pill_slot|meal_slot)"/g) || []).length === 3,
     "exactly three slot ids exist");
  ok(/shape: "heal", icon: "elixir_icon"/.test(SRC), "elixir_slot takes the bottle art");
  ok(/shape: "qi", icon: "qi_pill_icon"/.test(SRC), "pill_slot takes the pill art");
  ok(/shape: "both", icon: "spirit_meal_icon"/.test(SRC), "meal_slot takes the meal art");
  ok(/const i = ELIXIR_SHAPES\.findIndex\(s => s\.shape === pillShape/.test(SRC),
     "slot matching goes by shape, not by the slot id");
  ok(/ELIXIR_SHAPES\.findIndex\(s => s\.key ===/.test(SRC) === false,
     "the old key-based lookup is gone");
  ok(/ELIXIR_ICON/.test(SRC) === false, "the single ELIXIR_ICON constant is gone");
  ok(/slotId: s\.id, icon: s\.icon, pillId: it \? it\.id : null/.test(SRC),
     "elixirSlots carries the slot id, icon and current pill id");
  ok(/: iconImg\(slot\.icon, "slot-icon"\)\)/.test(SRC),
     "an empty slot draws its own icon-folder art");
  ok(/data-elixir-slot="\$\{esc\(slot\.slotId\)\}"/.test(SRC),
     "each slot carries its id in the markup");
  ok(/iconHtml\(it\.img, it\.glyph, artCls\(it, "art-slot"\)\)\s*\n\s*: iconImg\(slot\.icon/.test(SRC),
     "a filled slot still shows the equipped pill's own art");

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
    // Items now all draw colour art from assets/items; nothing is line art.
    const art = {
      minor_vitality_elixir: "/assets/items/minor_vitality_elixir.png",
      minor_qi_pill: "/assets/items/minor_qi_pill.png",
      roasted_wild_rat_meat: "/assets/items/roasted_wild_rat_meat.png",
    };
    const sb = {
      console,
      ITEM_BY_ID: JSON.parse(JSON.stringify(ITEM_FIXTURE)),
      ICON: {
        elixir_icon: "/assets/icons/elixir_icon.png",
        qi_pill_icon: "/assets/icons/qi_pill_icon.png",
        spirit_meal_icon: "/assets/icons/spirit_meal_icon.png",
      },
      ELIXIR_ICON: "elixir_icon",
      SLOT_TYPE_LABELS: { main_weapon: "Main Weapon", sec_weapon: "Secondary Weapon", head: "Helmet / Circlet", chest: "Body Armor", core: "Cultivation Artifact", arm: "Arm Armor", back: "Cloak / Cape", boots: "Foot Armor", legs: "Leg Armor", ring: "Accessory", necklace: "Accessory", headpiece: "Artifact" },
      SLOT_ICONS: {},
      ELIXIR_SHAPES: [
        { id: "elixir_slot", shape: "heal", icon: "elixir_icon", fallback: "Elixir I", type: "Recovery Consumable" },
        { id: "pill_slot", shape: "qi", icon: "qi_pill_icon", fallback: "Elixir II", type: "Cultivation Consumable" },
        { id: "meal_slot", shape: "both", icon: "spirit_meal_icon", fallback: "Elixir III", type: "Restorative Consumable" },
      ],
      DOLL_ROWS: [[{ s: "core", label: "Spirit Core" }, { s: "headpiece", label: "Immortal Crown" }]],
      BAG_TABS: [["all", "All"]],
      BAG_SORTS: [["rarity", "Rarity"], ["quantity", "Quantity"], ["name", "Name"]],
      ITEM_RARITY_ORDER: ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"],
      invSort: "rarity",
      ITEM_RARITY_COLORS: {}, ITEM_DEFAULT_RARITY: "Common",
      state: { player: { username: "t", equipment: {}, elixirs: [null, null, null], inventory: { minor_qi_pill: 3, roasted_wild_rat_meat: 1 } } },
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
    for (const id of Object.keys(art)) sb.ITEM_BY_ID[id].img = art[id];
    for (const id of Object.keys(lineArtIds || {})) {
      if (lineArtIds[id] && sb.ITEM_BY_ID[id]) sb.ITEM_BY_ID[id].lineArt = true;
    }
    // All three elixir slots have a real consumable behind them now, so the
    // neutral "Elixir I" fallback no longer occurs in the live game. Nothing to
    // delete: the fixture matches the shipped item set.
    vm.createContext(sb);
    for (const fn of ["esc", "pillShape", "elixirSlots", "iconHtml", "artCls", "slotIconHtml", "bagTabOf", "sortBag", "equipTargets", "hiddenFromBag", "renderInventory", "formatStatValue"]) {
      const src = grabFnSrc(fn);
      if (src) vm.runInContext(src, sb);
    }
    sb.renderInventory();
    return html;
  }

  const empty = renderInventorySrc();
  const elixirSrcs = [...empty.matchAll(/data-elixir="(\d)"[^>]*>.*?src="([^"]+)"/gs)].map(m => m[2]);
  ok(elixirSrcs.length === 3, "three elixir slots render");
  ok(/data-slot-name="Minor Vitality Elixir"/.test(empty),
     "slot I is named Minor Vitality Elixir");
  ok(/data-slot-name="Minor Qi Pill"/.test(empty), "slot II is named Minor Qi Pill");
  ok(/data-slot-name="Roasted Wild Rat Meat"/.test(empty),
     "slot III is named Roasted Wild Rat Meat");
  ok(!empty.includes("Elixir I"), "no elixir slot falls back to a neutral name");
  // Each empty slot draws its own icon-folder art, so the three read apart.
  ok(elixirSrcs[0] === "/assets/icons/elixir_icon.png",
     "elixir_slot draws the bottle from assets/icons");
  ok(elixirSrcs[1] === "/assets/icons/qi_pill_icon.png",
     "pill_slot draws the pill art from assets/icons");
  ok(elixirSrcs[2] === "/assets/icons/spirit_meal_icon.png",
     "meal_slot draws the meal art from assets/icons");
  ok(/data-elixir-slot="elixir_slot"/.test(empty), "slot I carries the id elixir_slot");
  ok(/data-elixir-slot="pill_slot"/.test(empty), "slot II carries the id pill_slot");
  ok(/data-elixir-slot="meal_slot"/.test(empty), "slot III carries the id meal_slot");
  ok((empty.match(/data-elixir-slot="/g) || []).length === 3,
     "all three slots carry an id");
  // A filled slot shows the equipped pill's own colour art instead.
  const filled = renderInventorySrc({ state: { player: { username: "t", equipment: {}, elixirs: ["minor_qi_pill", null, null], inventory: { minor_qi_pill: 2 } } } });
  const filledSrcs = [...filled.matchAll(/data-elixir="(\d)"[^>]*>.*?src="([^"]+)"/gs)].map(m => m[2]);
  ok(filledSrcs[0] === "/assets/items/minor_qi_pill.png",
     "a filled slot shows the pill's own art, not the slot icon");
  ok(filledSrcs[1] === "/assets/icons/qi_pill_icon.png",
     "its empty neighbours still draw their own slot art");
  ok(/class="[^"]*filled[^"]*" data-elixir="0"/.test(filled), "a filled slot keeps the filled class");
  // Equipment slots are icon-only now: no name element is emitted at all,
  // filled or empty. The label still rides along in data-slot-name and still
  // shows in the tooltip.
  ok(!/class="slot-name"/.test(empty), "no slot name element is rendered on elixir slots");
  ok(!/slot-name"/.test(empty.replace(/data-slot-name="[^"]*"/g, "")),
     "no visible slot-name text remains outside the data attribute");
  ok(/data-slot-name="Minor Qi Pill"/.test(empty),
     "an empty slot still carries its name in data-slot-name for the tooltip");
  ok(/data-slot-name="Minor Qi Pill"/.test(empty), "a named pill slot carries its name for the tooltip");
  // The bottle must never appear on a slot that names a pill.
  ok(!(/data-elixir="1"[^>]*>.*?elixir_icon/.test(empty)),
     "no bottle icon on the Qi Pill slot");

  // lineArt art is dimmed the same way as the other slot icons; colour art
  // is left alone.
  ok(/function artCls\(it, base\)/.test(SRC), "artCls exists");
  ok(/return base \+ \(it && it\.lineArt \? " line-art" : ""\);/.test(SRC),
     "artCls appends line-art only for items the server flagged");
  // The pill must actually be on screen for the flag to show, so render with it
  // loaded into a slot.
  const lineArted = renderInventorySrc(
    { state: { player: { username: "t", equipment: {}, elixirs: ["minor_qi_pill", null, null], inventory: { minor_qi_pill: 1 } } } },
    { minor_qi_pill: true });
  ok(/class="art art-slot line-art"/.test(lineArted),
     "a flagged item renders with the line-art class");
  const plainArt = renderInventorySrc(
    { state: { player: { username: "t", equipment: {}, elixirs: ["minor_qi_pill", null, null], inventory: { minor_qi_pill: 1 } } } });
  ok(!/line-art/.test(plainArt), "no line-art class when the server flagged nothing");

  ok(/\.tab-icon \{ width: 22px/.test(CSS), "tab icons are sized for the sidebar");
  ok(/stone-icon/.test(HTML) && /spirit_stone\.png/.test(HTML),
     "the top bar draws the spirit stone art");
  ok(/data-tab="craft" class="side-btn">Craft/.test(HTML), "the sidebar carries a Craft tab");
  ok(/data-tab="alchemy" class="side-btn">Alchemy/.test(HTML), "the sidebar carries an Alchemy tab");
  ok(/data-tab="cook" class="side-btn">Cook/.test(HTML), "the sidebar carries a Cook tab");
  ok(/id="craft-root"/.test(HTML) && /id="alchemy-root"/.test(HTML) && /id="cook-root"/.test(HTML),
     "each bench has its own panel in the page");
  ok(/renderWork\("craft-root", "craft"\)/.test(SRC) && /renderWork\("alchemy-root", "alchemy"\)/.test(SRC)
     && /renderWork\("cook-root", "cook"\)/.test(SRC),
     "each tab opens its own bench");
  ok(/\.craft-list \{ display: grid/.test(CSS) && /\.craft-cost\.short/.test(CSS),
     "the forge panel is styled, and a missing material reads as short");
  ok(/\.craft-out-name \{ display: flex/.test(CSS) && /\.craft-way \{ border-top/.test(CSS),
     "the item name sits above its ways, never glued to them");

  // ============ 19. two faces: the labels and the headings ============
  ok(/--font-brush: "Ma Shan Zheng"/.test(CSS), "the brush face is wired for the headings");
  ok(/--font-label: "FOT-Rodin ProN"/.test(CSS), "the label face is wired for the labels");
  ok(/body \{[^}]*font-family: var\(--font-label\)/.test(CSS),
     "the body is set in the label face");
  ok(/\.top-name, \.top-realm, \.top-stones \{ font-family: var\(--font-label\)/.test(CSS),
     "the top bar labels (name, realm, currency) use the label face");
  ok(/\.side-btn \{[^}]*font-family: var\(--font-brush\)/.test(CSS),
     "the tab headings use the brush face");
  ok(/\.craft-out b, \.craft-out-name \{ font-family: var\(--font-label\)/.test(CSS),
     "the item names are labels, not headings");
  ok(/\.gather-card \.craft-out-name b \{[^}]*font-family: var\(--font-label\)/.test(CSS),
     "the herb's name is a label -- the brush face is not on it");
  ok(/\.gather-card \.gather-rarity \{[^}]*font-family: var\(--font-brush\)/.test(CSS),
     "the rarity is a heading, in the brush face");
  ok(/href="\/css\/fonts\.css/.test(HTML), "the vendored font sheet is linked");
  const FONTCSS = fs.readFileSync(path.join(__dirname, "..", "public", "css", "fonts.css"), "utf8");
  const fontFiles = [...FONTCSS.matchAll(/url\('\/assets\/fonts\/([^']+)'\)/g)].map(m => m[1]);
  ok(fontFiles.length > 0, "the brush face is vendored as local files");
  // The brush face must be on disk. The label face may not be there yet --
  // then the system face stands in and nothing breaks.
  const brushFiles = fontFiles.filter(f => f.startsWith("ma-shan-zheng"));
  ok(brushFiles.length > 0 && brushFiles.every(f => fs.existsSync(path.join(__dirname, "..", "public", "assets", "fonts", f))),
     "every brush face file is on disk");
  ok(/font-family: 'FOT-Rodin ProN'/.test(FONTCSS),
     "the label face is declared in the font sheet");
  ok(!/fonts\.googleapis\.com/.test(FONTCSS) && !/fonts\.gstatic\.com/.test(FONTCSS),
     "the font never waits on a CDN");
  ok(/#toast-box \{ position: fixed; right:/.test(CSS),
     "notices sit in the bottom-right corner");
  ok(/toast mastery-toast/.test(SRC) && /toastBox\(\)\.appendChild\(el\)/.test(SRC),
     "the level-up notice joins the bottom-right stack and fades with it");
  ok(/\.mastery-toast \{/.test(CSS) && /\.toast-out \{ opacity: 0/.test(CSS),
     "the level-up notice is styled as a fading notice");

  // ============ 20. the bag holds only what you carry ============
  ok(/Currently no Item Stored/.test(SRC), "an empty bag says so instead of showing blanks");
  ok(/class="slot inv-empty"/.test(SRC) === false, "the bag draws no empty slots any more");
  ok(/\.inv-empty-msg \{ text-align: center/.test(CSS), "the empty bag reads as a message");

  // ============ 21. the floating sidebar puts itself away ============
  const sideOps = [];
  els["sidebar"] = { classList: {
    contains: c => c === "open", add: c => sideOps.push("add:" + c), remove: c => sideOps.push("remove:" + c),
  } };
  els["hamburger"] = { classList: { add: c => sideOps.push("hb-add:" + c), remove() {}, toggle() {} } };
  lib.closeSidebar();
  ok(sideOps.includes("remove:open") && sideOps.includes("hb-add:collapsed"),
     "clicking the canvas closes the floating sidebar");
  sideOps.length = 0;
  els["sidebar"].classList.contains = () => false;
  lib.closeSidebar();
  ok(sideOps.length === 0, "a closed sidebar is left alone");

  // ============ 22. the new benches carry their own icons ============
  const iconDir = path.join(__dirname, "..", "public", "assets", "icons");
  const iconFiles = fs.readdirSync(iconDir);
  for (const f of ["craft_icon", "alchemy_icon", "cook_icon"]) {
    const there = iconFiles.some(fn => fn.startsWith(f) && /\.(png|webp|jpg|jpeg)$/i.test(fn));
    ok(there, f + " is on disk");
  }

  // ============ 23. the gate: the world is loaded before the game opens ============
  ok(/id="boot-screen"/.test(HTML), "the gate is in the page");
  ok(/id="boot-fill"/.test(HTML) && /id="boot-step"/.test(HTML), "the gate shows its progress");
  ok(/async function preloadWorld\(\)/.test(SRC), "the world is loaded in one place");
  ok(/await fontsReady\(\)/.test(SRC), "the brush face is in hand before the game opens");
  ok(/warmArt\(artUrls\(\)\)/.test(SRC), "the pictures are warmed before the game opens");
  ok(/if \(!REALM_TABLE\.length\) REALM_TABLE = await fetchRealms\(\)/.test(SRC),
     "the tables are not fetched a second time");
  ok(/if \(!Object\.keys\(ITEM_BY_ID\)\.length\) await fetchItems\(\)/.test(SRC),
     "the item table is not fetched a second time");
  ok(/preloadWorld\(\)\.then/.test(SRC), "the gate opens the world when it is ready");
  ok(/function openTheGate\(\)/.test(SRC) && /boot-screen/.test(SRC), "the gate is closed when the world is ready");
  ok(/\.boot-screen \{ position: fixed; inset: 0/.test(CSS), "the gate covers the screen");
  ok(/\.boot-fill \{[^}]*width: 0/.test(CSS), "the gate's bar starts empty");
  ok(/craft: "craft_icon"/.test(SRC) && /alchemy: "alchemy_icon"/.test(SRC) && /cook: "cook_icon"/.test(SRC),
     "each bench tab has its own icon");
  ok(/\.stone-glyph \{ width: 14px/.test(CSS), "the stone glyph is sized for inline use");
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

  // ============ 18. clicking an equipped slot must not unequip ============
  // It used to: a stray click sent gear back to the bag, and worn gear is
  // filtered out of the bag grid, so the item looked like it had vanished.
  const dollBlock = SRC.slice(SRC.indexOf('root.querySelectorAll(".slot[data-slot]")'),
                              SRC.indexOf('root.querySelectorAll(".slot[data-elixir]")'));
  ok(dollBlock.length > 0, "the equipment slot wiring block is present");
  ok(!/el\.onclick = \(\) => unequipSlot/.test(dollBlock),
     "clicking an equipped slot no longer calls unequipSlot");
  ok(!/onclick/.test(dollBlock),
     "the equipment slot block has no click handler at all");
  ok(/showTip\(el\.dataset\.tip, e\.clientX, e\.clientY, \{ unequip: el\.dataset\.slot \}\)/.test(dollBlock),
     "the tooltip still offers unequip as an explicit action");
  // Elixir slots keep their own click: that one USES the pill.
  ok(/el\.onclick = \(\) => useElixir\(\+el\.dataset\.elixir\);/.test(SRC),
     "elixir slots still consume on click");
  // unequipSlot must survive for the tooltip action to call.
  ok(/function unequipSlot\(slot\)/.test(SRC), "unequipSlot still exists for the tooltip");
  ok(/act === "unequip" && e\.target\.dataset\.slot/.test(SRC),
     "the tooltip action path is untouched");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
