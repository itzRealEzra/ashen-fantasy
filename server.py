"""
Ashen Fantasy - Text Based Cultivation RPG
Python stdlib only server (no pip install needed).

Run:  python server.py  [--port 8000]
Serves: public/ at /  + JSON API at /api/*
"""
import json
import random
import re
import sys
import time
import uuid
import os
import mimetypes

# Single source of truth for the build number. Must match CLIENT_VERSION in
# public/js/app.js and the footer in public/index.html. A player whose saved
# patch_version differs gets one patch-note mail when they next check mail.
SERVER_VERSION = "0.9.37"
CLIENT_VERSION = "0.9.37"  # for /status only; the client keeps its own copy
STARTED_AT = time.time()
RESTARTED_AT = 0
RESTART_SEQ = 0

# Admin-controlled state, all reachable from the console in admin.py.
# MAINTENANCE gates gameplay while leaving read-only endpoints and the client
# bootstrap working, so the game can still render its maintenance notice.
MAINTENANCE = {"on": False, "message": "", "since": None}
ANNOUNCEMENT = {"text": "", "at": 0}

# Paths refused while maintenance is on: anything that changes a save.
MAINTENANCE_BLOCKED = ("/api/sync", "/api/roll", "/api/create", "/api/craft")

# Optional shared secret for the admin endpoint. Unset means the admin API is
# reachable from localhost only, which is where the server binds by default.
ADMIN_TOKEN = os.environ.get("ASHEN_ADMIN_TOKEN", "")
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

# ----------------------------------------------------------------------------
# Spiritual Root definitions
# chance_pct is auto-derived: tier_weight / count_in_tier
# stats: qi_mult (cultivation speed), comprehension, physique, fortune (1-10)
# ----------------------------------------------------------------------------
RARITY_ORDER = ["Mortal", "Earth", "Heaven", "Immortal", "Divine", "Primordial"]
RARITY_WEIGHTS = {
    "Mortal": 45.0,
    "Earth": 25.0,
    "Heaven": 15.0,
    "Immortal": 8.0,
    "Divine": 5.0,
    "Primordial": 2.0,
}
RARITY_COLORS = {
    "Mortal": "#9aa0a6",
    "Earth": "#7cb342",
    "Heaven": "#42a5f5",
    "Immortal": "#ab47bc",
    "Divine": "#ffb300",
    "Primordial": "#ff3d00",
}

ROOTS = [
    # Mortal 45% / 5 = 9% each
    dict(id="muddy_earth", name="Muddy Earth Root", element="Earth", rarity="Mortal",
         desc="Thick, sluggish earth qi. Common among mortals, steady but slow.",
         qi_mult=0.8, comprehension=2, physique=3, fortune=2),
    dict(id="blunt_wood", name="Blunt Wood Root", element="Wood", rarity="Mortal",
         desc="Dull sprout that refuses to wither. Tenacious, unremarkable.",
         qi_mult=0.9, comprehension=2, physique=2, fortune=3),
    dict(id="murky_water", name="Murky Water Root", element="Water", rarity="Mortal",
         desc="Clouded stream qi. Hard to sense, harder to disperse.",
         qi_mult=0.9, comprehension=3, physique=1, fortune=2),
    dict(id="dim_fire", name="Dim Fire Root", element="Fire", rarity="Mortal",
         desc="A dying ember. Flickers when no one watches.",
         qi_mult=1.0, comprehension=1, physique=2, fortune=3),
    dict(id="dull_metal", name="Dull Metal Root", element="Metal", rarity="Mortal",
         desc="Rust-eaten iron qi. Heavy limbs, heavy fate.",
         qi_mult=0.8, comprehension=1, physique=3, fortune=1),
    # Earth 25% / 5 = 5% each
    dict(id="thick_earth", name="Thick Earth Root", element="Earth", rarity="Earth",
         desc="Mountain-backbone qi. Cultivation is slow, breakthroughs are stable.",
         qi_mult=1.2, comprehension=3, physique=5, fortune=3),
    dict(id="green_wood", name="Green Wood Root", element="Wood", rarity="Earth",
         desc="Spring bamboo vitality. Wounds close, meridians mend quickly.",
         qi_mult=1.3, comprehension=4, physique=4, fortune=4),
    dict(id="clear_stream", name="Clear Stream Root", element="Water", rarity="Earth",
         desc="Moonlit creek. Pure flow, excellent qi circulation.",
         qi_mult=1.4, comprehension=5, physique=3, fortune=4),
    dict(id="wildfire", name="Wildfire Root", element="Fire", rarity="Earth",
         desc="Prairie blaze. Violent absorption, violent temper.",
         qi_mult=1.5, comprehension=3, physique=4, fortune=3),
    dict(id="sharp_metal", name="Sharp Metal Root", element="Metal", rarity="Earth",
         desc="Unsheathed sword qi. Born for battle, poor at meditation.",
         qi_mult=1.3, comprehension=3, physique=5, fortune=3),
    # Heaven 15% / 4 = 3.75% each
    dict(id="thunderbolt", name="Thunderbolt Root", element="Thunder", rarity="Heaven",
         desc="Heavenly tribulation fragment. Cultivate amid lightning.",
         qi_mult=1.8, comprehension=5, physique=5, fortune=4),
    dict(id="gale_wind", name="Gale Wind Root", element="Wind", rarity="Heaven",
         desc="Formless storm. Untraceable movement, fleeting insight.",
         qi_mult=1.7, comprehension=6, physique=4, fortune=5),
    dict(id="frost", name="Frost Lotus Root", element="Ice", rarity="Heaven",
         desc="Lotus blooming on glacial lake. Heart like still ice.",
         qi_mult=1.6, comprehension=6, physique=4, fortune=5),
    dict(id="sword_bone", name="Sword Bone Root", element="Sword", rarity="Heaven",
         desc="Sword intent etched into bone. One man, one sword, one path.",
         qi_mult=1.9, comprehension=5, physique=6, fortune=4),
    # Immortal 8% / 3 ~ 2.67% each
    dict(id="nine_yang", name="Nine Yang Root", element="Yang", rarity="Immortal",
         desc="Blazing solar furnace. Masculine qi burns through bottlenecks.",
         qi_mult=2.4, comprehension=6, physique=8, fortune=6),
    dict(id="nine_yin", name="Nine Yin Root", element="Yin", rarity="Immortal",
         desc="Lunar abyss. Silent absorption under moonlight, twice as fast at night.",
         qi_mult=2.4, comprehension=8, physique=6, fortune=6),
    dict(id="alchemy_fire", name="Alchemy Fire Root", element="Fire", rarity="Immortal",
         desc="Pill-furnace heart flame. Alchemy success and fire arts soar.",
         qi_mult=2.2, comprehension=7, physique=6, fortune=7),
    # Divine 5% / 2 = 2.5% each
    dict(id="azure_dragon", name="Azure Dragon Root", element="Wood", rarity="Divine",
         desc="Descendant of the Eastern Azure Dragon. Imperial wood-thunder majesty.",
         qi_mult=2.9, comprehension=8, physique=9, fortune=8),
    dict(id="vermilion_phoenix", name="Vermilion Phoenix Root", element="Fire", rarity="Divine",
         desc="Nirvana bloodline. Fall and rise stronger with every tribulation.",
         qi_mult=2.9, comprehension=9, physique=8, fortune=8),
    # Primordial 2% / 2 = 1% each
    dict(id="chaos", name="Chaos Primordial Root", element="Chaos", rarity="Primordial",
         desc="Before heaven and earth split. Devours all five elements as one.",
         qi_mult=3.4, comprehension=10, physique=10, fortune=5),
    dict(id="hongmeng", name="Hongmeng Dao Root", element="Dao", rarity="Primordial",
         desc="A wisp of the Grand Mist. Heaven itself is jealous of this child.",
         qi_mult=3.5, comprehension=10, physique=9, fortune=9),
]

def attach_chances():
    counts = {}
    for r in ROOTS:
        counts[r["rarity"]] = counts.get(r["rarity"], 0) + 1
    out = []
    for r in ROOTS:
        c = dict(r)
        c["chance_pct"] = round(RARITY_WEIGHTS[r["rarity"]] / counts[r["rarity"]], 2)
        c["color"] = RARITY_COLORS[r["rarity"]]
        out.append(c)
    return out

ROOTS_WITH_CHANCE = attach_chances()
ROOT_BY_ID = {r["id"]: r for r in ROOTS_WITH_CHANCE}

# roll_id -> {offer:[ids], expires:ts, ip:str}
ROLLS = {}
PLAYERS = {}  # username -> player dict
LAST_ROLL_BY_IP = {}

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,16}$")

# ----------------------------------------------------------------------------
# Realm ladder (single source of truth; served via GET /api/realms)
# cost = Qi needed to breakthrough FROM this stage; rate grows per stage.
# ----------------------------------------------------------------------------
BASE_QI_PER_SEC = 1.0
OFFLINE_CAP_SEC = 8 * 3600
OFFLINE_EFF = 0.5
SECLUSION_MULT = 2.0
REALM_RATE_STEP = 0.15
ONLINE_GRACE_SEC = 300  # elapsed beyond this counts as offline (capped, 50%)
MANUAL_ALLOW_MULT = 6.0  # headroom per second: meditate clicks + battle Qi rewards
# Spirit stones ride the same client-side reward path as loot rolls, so the
# sync clamp only rejects absurd forgeries (there is no spend path yet; a
# shop must price and deduct server-side when it arrives).
SPIRIT_STONE_CAP = 1_000_000_000
# Crafting is capped per request so a fat finger cannot mint a mountain.
CRAFT_MAX_COUNT = 20

# ----------------------------------------------------------------------------
# Hunting areas (single source of truth; served via GET /api/areas)
# req_idx gates by player realm. Loot rolls are client-side; Qi rewards flow
# through accrue() and the /api/sync clamp like any other honest gain.
# Spirit stones are granted per kill from the mob's stones field.
#
# The grounds themselves live in data/areas_data.json: the world of beasts and
# their drops belongs in a file, not in this one.
# ----------------------------------------------------------------------------
def _mob_from_data(d):
    # stones: a currency, so a kill pays a real purse. The range scales with
    # the beast -- a Spectral Rat pays 10-20, the alpha wolf 151-302.
    qi = int(d.get("qi", 0) or 0)
    s_lo = qi * 3 + 1
    return {"id": d["id"], "name": d["name"], "realm": d.get("realm", "Mortal"),
            "difficulty": d.get("difficulty", "Easy"), "desc": d.get("desc", ""),
            "glyph": d.get("glyph", "👤"),
            "hp": int(d.get("hp", 10)), "atk": int(d.get("atk", 1)),
            "def": int(d.get("def", 0)), "crit": 5, "crit_dmg": 150,
            "speed": float(d.get("speed", 1.0)), "qi": qi,
            "stones": {"min": s_lo, "max": s_lo * 2},
            "loot": list(d.get("loot") or []),
            "req_idx": int(d.get("req_idx", 0)), "boss": bool(d.get("boss", False))}

def _areas_from_data(data):
    areas = []
    for a in data.get("areas", []):
        area = dict(a)
        area["mobs"] = [_mob_from_data(m) for m in a.get("mobs", [])]
        areas.append(area)
    return areas


# ----------------------------------------------------------------------------
# ----------------------------------------------------------------------------
# Data files
#
# The tables that grow fastest live in data/ as JSON, and the server reads
# them at start-up: one place, no copy of the same list in this file.
# ----------------------------------------------------------------------------
DATA_DIR = os.path.join(BASE_DIR, "data")

def _load_data(name, fallback):
    try:
        with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return fallback

HERB_DATA = _load_data("herbs_data.json", {"herbs": []})
SKILL_DATA = _load_data("skills_data.json", {"skills": [], "slots": 3})
AREA_DATA = _load_data("areas_data.json", {"areas": []})
RECIPE_DATA = _load_data("recipes_data.json", {"recipes": []})
MASTERY_DATA = _load_data("mastery_data.json", {"tracks": {}, "unlocks": {}})

# The herb table: id -> the herb it is.
HERBS = {h["id"]: h for h in HERB_DATA.get("herbs", [])}
HERB_IDS = tuple(HERBS.keys())
HERB_RARITY_ORDER = HERB_DATA.get("rarities") or ITEM_RARITY_ORDER

# The masteries: five tracks, and every one of them works the same way --
# twelve ranks of ten levels, a named rank, and a bonus bought with each
# level. data/mastery_data.json is the only place the ranks are written down.
MASTERY_TRACK_DATA = MASTERY_DATA.get("tracks", {})
MASTERY_UNLOCKS = MASTERY_DATA.get("unlocks", {})
MASTERY_LEVELS_PER_RANK = int(MASTERY_DATA.get("levels_per_rank", 10))
MASTERY_RANKS = {t: list(v.get("ranks", [])) for t, v in MASTERY_TRACK_DATA.items()}
MASTERY_MAX_LEVEL = max(1, max((len(v) for v in MASTERY_RANKS.values()), default=1)
                        * MASTERY_LEVELS_PER_RANK)

# The herb mastery: twelve ranks of ten levels.
HERB_RANKS = MASTERY_RANKS.get("herbs", [])
HERB_UNLOCKS = MASTERY_UNLOCKS
HERB_LEVELS_PER_RANK = MASTERY_LEVELS_PER_RANK
HERB_TIME_CAP = float(MASTERY_TRACK_DATA.get("herbs", {}).get("time_reduction_cap", 50)) / 100.0
HERB_BONUS_CAP = float(MASTERY_TRACK_DATA.get("herbs", {}).get("bonus_cap", 25)) / 100.0
HERB_MAX_LEVEL = max(1, len(HERB_RANKS) * HERB_LEVELS_PER_RANK)

# The hunting grounds, from data/areas_data.json.
AREAS = _areas_from_data(AREA_DATA)

# The technique table, from data/skills_data.json.
SKILL_SLOTS = int(SKILL_DATA.get("slots", 3))
SKILLS = {s["id"]: s for s in SKILL_DATA.get("skills", [])}
SKILL_IDS = tuple(SKILLS.keys())

# Item database (single source of truth; served via GET /api/items)
# kind: gear (equippable) / consumable (usable) / material (future crafting)
#
# Item rarity ladder. Separate from the Spiritual Root ladder above
# (Mortal -> Primordial), which only ever describes a root.
# Rarity and drop chance are independent: a Rare item can drop often if it is
# meant to be a routine progression material.
# ----------------------------------------------------------------------------
ITEM_RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic",
                     "Divine", "Primordial"]
ITEM_RARITY_COLORS = {
    "Common": "#9aa0a6",     # gray
    "Uncommon": "#7cb342",   # green
    "Rare": "#42a5f5",       # blue
    "Epic": "#ab47bc",       # purple
    "Legendary": "#ffb300",  # gold
    "Mythic": "#ff3d00",     # crimson
    "Divine": "#00e5ff",     # bright cyan
    "Primordial": "#ff2fd0", # magenta
}
# Typical drop-chance band per rarity, used only to sanity-check a drop table.
ITEM_RARITY_BANDS = {
    "Common": (60, 90), "Uncommon": (30, 59), "Rare": (10, 29),
    "Epic": (3, 15), "Legendary": (0.5, 3), "Mythic": (0.1, 0.5),
    "Divine": (0.05, 0.5), "Primordial": (0.01, 0.05),
}
# What an item sells for, in spirit stones, by rarity.
ITEM_VALUE_BY_RARITY = {
    "Common": 5, "Uncommon": 15, "Rare": 45, "Epic": 120,
    "Legendary": 320, "Mythic": 900,
}

# The stat block every item carries. Beyond the old six (attack, defense, hp,
# crit, crit damage, qi rate) the body has finer measures:
#   agility -- attack speed, a percent faster swings
#   luck    -- a percent more likely to find something extra
#   spirit  -- accuracy, how surely a technique finds its mark
#   evasion -- a percent of the enemy's blows that never land
#   energy  -- the pool the techniques draw from
#   cdr     -- cooldown reduction, a percent off every technique's wait
_STAT_KEYS = ("atk", "def", "hp", "crit", "critDmg", "qi_rate_pct",
              "agility", "luck", "spirit", "evasion", "energy", "cdr")

def _stat_block():
    return {k: 0 for k in _STAT_KEYS}

def _gear(id, name, slot, glyph, desc, stats=None):
    # qi_rate_pct is a percentage bonus to passive, offline, and manual cultivation.
    base = _stat_block()
    if stats:
        base.update(stats)
    return {"id": id, "name": name, "kind": "gear", "slot": slot,
            "glyph": glyph, "desc": desc, "stats": base}

def _con(id, name, glyph, desc, heal_pct=0, qi_pct=0):
    return {"id": id, "name": name, "kind": "consumable", "slot": None,
            "glyph": glyph, "desc": desc,
            "stats": _stat_block(),
            "use": {"heal_pct": heal_pct, "qi_pct": qi_pct}}

# Items are added back one at a time. Copy the template below and give the
# new item a unique id, the slot it equips into, and its stat block.
#
#   _gear("item_id", "Item Name", "main_weapon", "⚔️", "Flavour text.",
#         {"atk": 6, "def": 0, "hp": 0, "crit": 0, "critDmg": 0,
#          "qi_rate_pct": 0}),
#
# Remember to add a drop source for it in _GEAR_DROPS below.
GEAR = [
    # ---- Newbie starter pack (see STARTER_PACK): a full Common set, one
    # piece per armour slot. Deliberately not on any drop table -- the only
    # way to get these is the starter pack mail.
    _gear("wooden_sword", "Wooden Sword", "main_weapon", "🗡️",
          "A practice blade, notched from a sapling. Every master kept one.",
          {"atk": 5, "spirit": 1}),
    _gear("leather_helmet", "Leather Helmet", "head", "🧢",
          "Boiled hide, laced tight. Keeps the scalp from splitting.",
          {"def": 2, "hp": 10}),
    _gear("leather_chest", "Leather Chest", "chest", "🦺",
          "Hardened leather over a cotton wrap. Heavy, honest protection.",
          {"def": 3, "hp": 20}),
    _gear("leather_leggings", "Leather Leggings", "legs", "👖",
          "Reinforced at the knees, where the beast's claws land first.",
          {"def": 2, "hp": 15}),
    _gear("leather_bracers", "Leather Bracers", "arm", "🧤",
          "Thin hide guards. A little defence, a little grip.",
          {"atk": 1, "def": 2}),
    _gear("leather_boots", "Leather Boots", "boots", "👢",
          "Soles thick enough to outlast a wolf's sprint.",
          {"def": 2, "hp": 10, "agility": 1}),
    _gear("leather_cape", "Leather Cape", "back", "🧣",
          "Travel-worn, ash-stained. It hides nothing, but it catches the wind.",
          {"def": 1, "crit": 1, "evasion": 2}),

    # ---- Second batch. Slots were picked to fill the ones the starter pack
    # left empty (off-hand, core, necklace, accessory) plus a second, weaker
    # option for the head slot.
    _gear("wooden_shield", "Wooden Shield", "sec_weapon", "🛡️",
          "Planks and a iron rim. Heavy, honest, and better than an open hand.",
          {"def": 3, "hp": 10}),
    _gear("cloth_headband", "Cloth Headband", "headpiece", "🎗️",
          "A knotted strip of dyed linen, worn at the brow. It stops sweat "
          "reaching the eyes -- and takes the place a crown would.",
          {"def": 1, "hp": 5}),
    _gear("cracked_qi_stone", "Cracked Qi Stone", "core", "🪨",
          "A stone split by a thin seam of living qi. It hums when you breathe.",
          {"def": 2, "hp": 15, "qi_rate_pct": 5, "spirit": 2}),
    _gear("chipped_jade_pendant", "Chipped Jade Pendant", "necklace", "📿",
          "Jade with a corner broken off. Still cool against the sternum.",
          {"hp": 12, "crit": 1, "energy": 10}),
    _gear("copper_spirit_ring", "Copper Spirit Ring", "ring", "💍",
          "A plain copper band that sharpens the wearer's critical strikes.",
          {"crit": 2, "critDmg": 5, "luck": 2}),
    _gear("jade_guard_ring", "Jade Guard Ring", "ring", "💎",
          "Dense green jade that steadies the body and turns aside blows.",
          {"def": 2, "hp": 15, "cdr": 5}),
    _gear("qi_gathering_ring", "Qi Gathering Ring", "ring", "🔹",
          "A spirit-threaded ring that helps draw ambient Qi into the dantian.",
          {"qi_rate_pct": 5, "energy": 15}),
]

# Gear rarity follows root-rarity colors (valley Mortal -> peaks Immortal).
# Add an id here to override its rarity; anything unlisted stays "Common".
_GEAR_RARITY = {"jade_guard_ring": "Uncommon"}
for _g in GEAR:
    _g["rarity"] = _GEAR_RARITY.get(_g["id"], "Common")

# Consumables are the seed items. Add new ones here with
# _con(id, name, glyph, desc, heal_pct=, qi_pct=). A pill's `use` stats decide
# which elixir slot it can occupy: heal only / qi only / both.
# Consumables are the elixir slots. Each restores either HP, Qi, or both, and
# a slot is labelled after the first consumable matching its shape, so the
# intended pill for each of the three slots is listed first.
CONSUMABLES = [
    # ---- elixir slot I (heal only)
    _con("minor_vitality_elixir", "Minor Vitality Elixir", "🧪",
         "Red as a fresh wound, and it burns going down. Restores a good "
         "share of the body, and nothing else.", heal_pct=20),
    # ---- elixir slot II (Qi only)
    _con("minor_qi_pill", "Minor Qi Pill", "🔹",
         "A thin blue pellet. Cloud enters through it faster than breath.",
         qi_pct=15),
    # ---- elixir slot III (heal + Qi)
    _con("roasted_wild_rat_meat", "Roasted Wild Rat Meat", "🍖",
         "Hot, salted, and better than it looks. Feeds the body and warms "
         "the meridians at once.", heal_pct=15, qi_pct=5),
    # ---- cooked food. These come after the three slot seeds on purpose:
    # the slot labels take the first consumable of their shape, so a new
    # meal must never steal the meal slot's name.
    _con("boar_roast", "Boar Roast", "🍖",
         "Fat rendered slow over a bloodied tusk. It sits heavy and warm.",
         heal_pct=25, qi_pct=5),
    _con("wolf_stew", "Wolf Stew", "🥘",
         "Marrow and a little wolf essence, simmered down. Sharp, and it "
         "warms you through.", heal_pct=15, qi_pct=10),
    _con("spirit_dumpling", "Spirit Dumpling", "🥟",
         "Dough folded around a core fragment. It tastes of qi, not flour.",
         heal_pct=30, qi_pct=15),
]
for _c in CONSUMABLES:
    _c["rarity"] = "Common"

def _slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")

_ZERO = _stat_block()

def _material_rarities():
    """Highest rarity any beast drops each material under."""
    out = {}
    for a in AREAS:
        for m in a["mobs"]:
            for l in m["loot"]:
                r = l.get("rarity") or "Common"
                if ITEM_RARITY_ORDER.index(r) > ITEM_RARITY_ORDER.index(out.get(l["item"], "Common")):
                    out[l["item"]] = r
    return out

_MATERIAL_RARITY = _material_rarities()

# Every battle material becomes an inventory item (crafting coming soon).
# Derived from the mob loot tables, so it refills itself — and takes its
# rarity — as loot comes back.
MATERIALS = [{"id": _slug(name), "name": name, "kind": "material", "slot": None,
              "glyph": "✦", "rarity": _MATERIAL_RARITY.get(name, "Common"),
              "color": ITEM_RARITY_COLORS[_MATERIAL_RARITY.get(name, "Common")],
              "desc": "Battle loot. Spent at the forge to craft gear and pills.",
              "stats": dict(_ZERO)}
             for name in sorted({l["item"] for a in AREAS for m in a["mobs"] for l in m["loot"]})]

# The herbs are items: a herb in the bag is an item in the bag. They come
# from data/herbs_data.json, so the world of herbs lives in one file.
HERB_ITEMS = [{"id": h["id"], "name": h["name"], "kind": "herb", "slot": None,
               "glyph": "🌿", "rarity": h.get("rarity", "Common"),
               "desc": h.get("desc") or ("A %s herb of the %s. Gathered, never found lying about."
                                        % (h.get("rarity", "humble").lower(), h.get("element", "wild").lower())),
               "element": h.get("element", ""), "time": h.get("time", 10),
               "stats": _stat_block()} for h in HERBS.values()]

ITEMS = GEAR + CONSUMABLES + MATERIALS + HERB_ITEMS
ITEM_BY_ID = {it["id"]: it for it in ITEMS}
# Every item carries its rarity colour, not just materials, so the client can
# colour a slot from the payload alone.
for _it in ITEMS:
    _it["color"] = ITEM_RARITY_COLORS[_it["rarity"]]
    # What it is worth in spirit stones. The rarity sets the band; a piece of
    # gear is worth more than a material of the same rarity, because a
    # material is only an ingredient.
    _band = ITEM_VALUE_BY_RARITY.get(_it["rarity"], 5)
    _it["value"] = _band * 2 if _it["kind"] == "gear" else _band
EQUIP_SLOTS = ("head", "sec_weapon", "chest", "main_weapon", "core", "arm",
               "back", "boots", "legs", "ring1", "ring2", "necklace", "headpiece")

# Gear slots worn more than once. An item declares the group ("ring") and any
# one of the group's slots will take it, so nothing downstream has to special
# case ring1/ring2 by name.
SLOT_GROUPS = {"ring": ("ring1", "ring2")}


def herb_level(xp):
    """Level for a total herb XP figure (the same curve the other tracks use)."""
    return mastery_level(xp)

def herb_rank_of(xp):
    """(rank number, level within the rank, rank name) for a herb XP figure."""
    return mastery_rank_of("herbs", xp)

def herb_bonuses(xp):
    """The bonuses the current herb rank buys: faster gathering, more herbs,
    and the chance of turning up something rarer."""
    rank, within, _ = herb_rank_of(xp)
    if not HERB_RANKS:
        return 0.0, 0.0, None, 0.0
    r = HERB_RANKS[min(len(HERB_RANKS) - 1, rank - 1)]
    time_red = min(HERB_TIME_CAP, r.get("time_reduction", 0.0) / 100.0 * within)
    bonus = min(HERB_BONUS_CAP, r.get("bonus", 0.0) / 100.0 * within)
    disc = r.get("discovery") or None
    disc_chance = (disc.get("bonus", 0.0) / 100.0 * within) if disc else 0.0
    return time_red, bonus, disc, disc_chance

def skills_payload():
    """The technique table, ready for the client."""
    out = []
    for s in SKILLS.values():
        row = dict(s)
        row.setdefault("img", "/assets/icons/skill_icon.png")
        out.append(row)
    return out


# ----------------------------------------------------------------------------
# Techniques (skills)
#
# A technique is a named move the player wears. They fire on their own once
# their cooldown is up and there is energy for them, so the fight plays
# itself: the player chooses what to carry, not when to swing it.
#
# The table lives in data/skills_data.json.
# ----------------------------------------------------------------------------
def slot_accepts(item_slot, equip_slot):
    """True if a piece with `item_slot` may be worn in `equip_slot`."""
    if item_slot == equip_slot:
        return True
    return equip_slot in SLOT_GROUPS.get(item_slot, ())




# ----------------------------------------------------------------------------
# Crafting recipes (single source of truth; served via GET /api/recipes)
#
# A recipe turns beast parts into an item. The server owns the rule: it
# checks the materials, spends them and hands over the result, so a client
# cannot craft for free. The client only renders this table.
#
# Recipes are split into three trades by what they make, so gear, pills and
# food never share a bench:
#   craft   -- gear (the smith's bench)
#   alchemy -- pills and elixirs (the mortar)
#   cook    -- food (the pot)
# The trade is derived from the output item, so it can never drift from
# what the recipe actually hands over.
#
# One recipe per item: every item is made one way, and every material in
# the game has a use.
# ----------------------------------------------------------------------------
def _recipe(id, out, cost, count=1, note=""):
    return {"id": id, "out": out, "count": count, "cost": cost, "note": note}

def _recipe_kind(out_id):
    """Which trade a recipe belongs to, decided by what it makes."""
    it = ITEM_BY_ID.get(out_id) or {}
    if it.get("kind") == "consumable":
        u = it.get("use") or {}
        # a meal heals and warms at once; a pill or elixir does one of the two
        return "cook" if (u.get("heal_pct") and u.get("qi_pct")) else "alchemy"
    return "craft"

# The forge table, from data/recipes_data.json: one recipe per item, every
# material in the game with a use.
RECIPES = []
for _r in RECIPE_DATA.get("recipes", []):
    _rec = _recipe(_r["id"], _r["out"], dict(_r.get("cost") or {}),
                    int(_r.get("count", 1)), _r.get("note", ""))
    # The trade comes from the file, and is checked against what the recipe
    # actually makes -- the file can never quietly put a pill on the smith's
    # bench.
    _rec["kind"] = _r.get("kind") or _recipe_kind(_rec["out"])
    _rec["max_count"] = int(_r.get("max_count", 20))
    RECIPES.append(_rec)
RECIPE_BY_ID = {r["id"]: r for r in RECIPES}

# ----------------------------------------------------------------------------
# Masteries
#
# Five tracks -- cooking, alchemy, crafting, battle and herbs -- and every one
# of them works the same way: twelve ranks of ten levels (I-X). The level
# comes from the XP and the rank from the level, so a level 10 cooking is
# "Adept Cook X" and a level 11 is "Expert Cook I". The ranks and what each
# level buys live in data/mastery_data.json.
#
# The three trades grant their own XP where the work happens (on the server),
# and every level of a trade buys a chance to duplicate what you made. Battle
# XP is earned on the kill and reported with the save. The herbalist track
# teaches itself by gathering.
# ----------------------------------------------------------------------------
HERB_XP_PER_GATHER = 20  # per gather, doubled for every rarity above Common
MASTERY_TRACKS = ("cooking", "alchemy", "crafting", "battle", "herbs")
MASTERY_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
MASTERY_XP_CAP = 10 ** 9
MASTERY_XP_PER_CRAFT = 10   # per item made
MASTERY_XP_PER_KILL = 5
MASTERY_DUPLICATE_CAP = 0.5  # a trade never doubles more than half the time
# Which track each bench feeds.
MASTERY_TRACK_FOR_BENCH = {"craft": "crafting", "alchemy": "alchemy", "cook": "cooking"}

def mastery_total_xp(level):
    """Total XP needed to stand at `level` (level 1 is free)."""
    return 50 * level * (level - 1)

def mastery_level(xp):
    lvl = 1
    xp = max(0, int(xp or 0))
    while lvl < MASTERY_MAX_LEVEL and mastery_total_xp(lvl + 1) <= xp:
        lvl += 1
    return lvl

def mastery_numeral(level):
    return MASTERY_NUMERALS[(level - 1) % 10]

def track_ranks(track):
    return MASTERY_RANKS.get(track) or []

def mastery_rank_of(track, xp):
    """(rank, level inside the rank, rank name) for a track."""
    ranks = track_ranks(track)
    lvl = mastery_level(xp)
    if not ranks:
        return 1, lvl, track.title()
    idx = min(len(ranks) - 1, (lvl - 1) // MASTERY_LEVELS_PER_RANK)
    within = (lvl - 1) % MASTERY_LEVELS_PER_RANK + 1
    return idx + 1, within, ranks[idx].get("name", "")

def track_bonus(track, xp):
    """The gift the track's rank buys, as a fraction (0.25 is a quarter)."""
    ranks = track_ranks(track)
    if not ranks:
        return 0.0
    rank, within, _ = mastery_rank_of(track, xp)
    r = ranks[min(len(ranks) - 1, rank - 1)]
    cap = float(MASTERY_TRACK_DATA.get(track, {}).get("bonus_cap", 50)) / 100.0
    return min(cap, float(r.get("bonus", 0.0)) * within / 100.0)

def track_body_bonus(track, xp):
    """The body the track hardens, as a fraction (the hunt's own track)."""
    info = MASTERY_TRACK_DATA.get(track, {})
    per = float(info.get("body_per_level", 0.0))
    cap = float(info.get("body_cap", 100)) / 100.0
    lvl = mastery_level(xp)
    return min(cap, per * max(0, lvl - 1) / 100.0)

def _mastery_xp(stored, track):
    return int(((stored.get("mastery") or {}).get(track) or 0))

def _grant_mastery(stored, track, xp):
    m = stored.setdefault("mastery", {})
    m[track] = min(MASTERY_XP_CAP, _mastery_xp(stored, track) + max(0, int(xp)))
    return m[track]

def mastery_payload(stored):
    """What the client shows: xp, level, the rank and the level inside it.

    Every track answers the same way -- the herbs did it first, and the rest
    of the masteries follow the same shape.
    """
    out = {}
    for t in MASTERY_TRACKS:
        xp = _mastery_xp(stored, t)
        lvl = mastery_level(xp)
        rank, within, name = mastery_rank_of(t, xp)
        out[t] = {"xp": xp, "level": lvl, "rank": rank,
                  "rank_name": name, "within": within,
                  "numeral": mastery_numeral(lvl),
                  "next": mastery_total_xp(lvl + 1) - xp}
    return out

def mastery_definitions():
    """The rank tables, for the client: it draws the same names we do."""
    out = {}
    for t in MASTERY_TRACKS:
        info = MASTERY_TRACK_DATA.get(t, {})
        out[t] = {
            "label": info.get("label", t.title()),
            "gift": info.get("gift", ""),
            "bonus_cap": float(info.get("bonus_cap", 50)),
            "body_per_level": float(info.get("body_per_level", 0.0)),
            "body_cap": float(info.get("body_cap", 100)),
            "time_reduction_cap": float(info.get("time_reduction_cap", 0)),
            "ranks": [{"rank": r.get("rank", i + 1), "name": r.get("name", ""),
                       "bonus": r.get("bonus", 0),
                       "time_reduction": r.get("time_reduction", 0),
                       "discovery": r.get("discovery") or None}
                      for i, r in enumerate(track_ranks(t))],
        }
    return out

# ----------------------------------------------------------------------------
# Art assets. A mob or item draws its picture from a file named after its id
# (public/assets/enemies/wild_rat.png, public/assets/items/rat_fur.png). Any id
# with no matching file falls back to the holder picture below, and if that is
# missing too the client falls back to the item's emoji glyph, so art is added
# one file at a time.
#
# Resolved per request, not at import: dropping a new picture into the folder
# must show up on refresh without restarting the server.
# ----------------------------------------------------------------------------
_ASSET_DIRS = ("enemies", "items", "icons", "herb")
# Pictures the client can show. Both PNG and JPEG are picked up, so art can be
# dropped in either format.
_ASSET_EXTS = (".png", ".jpg", ".jpeg", ".webp")

# The holder: what every item without a picture of its own is drawn with
# (public/assets/items/place_holder.jpg). Resolved live, so removing the file
# puts the emoji glyph back.
_PLACEHOLDER_ITEM = "place_holder"

# Items whose art lives in public/assets/icons rather than assets/items.
# An item with no entry here is looked up in assets/items by its own id.
_ITEM_ICON_FILES = {
}


def _asset_cache():
    """id-keyed map of every art file currently on disk, keyed "kind/name".

    The names are read in order, so when a picture exists in two formats
    (a .png and the small .webp beside it) the webp wins -- it is the one
    the game draws.
    """
    out = {}
    for kind in _ASSET_DIRS:
        d = os.path.join(PUBLIC_DIR, "assets", kind)
        try:
            names = sorted(os.listdir(d))
        except OSError:
            continue
        for fn in names:
            low = fn.lower()
            if any(low.endswith(ext) for ext in _ASSET_EXTS):
                out["%s/%s" % (kind, fn.rsplit(".", 1)[0])] = "/assets/%s/%s" % (kind, fn)
    return out

def _apply_art(art):
    """Give every mob and item an `img` key when a matching file exists."""
    for a in AREAS:
        for m in a["mobs"]:
            p = art.get("enemies/" + m["id"])
            if p:
                m["img"] = p
            else:
                m.pop("img", None)
    for it in ITEMS:
        # The herbs keep their pictures in assets/herb, the rest in
        # assets/items. Then the icons/ override if this item has one. Art
        # from icons/ is white line art rather than a colour illustration, so
        # it is flagged `lineArt` and the client dims it to
        # match the other slot icons instead of rendering it as solid white.
        own = False
        p = art.get("items/" + it["id"])
        if p:
            own = True
        if not p and it.get("kind") == "herb":
            p = art.get("herb/" + it["id"])
            if p:
                own = True
        over = _ITEM_ICON_FILES.get(it["id"])
        if not p and over:
            p = art.get("icons/" + over)
            if p:
                it["lineArt"] = True
        if not p:
            # No picture of its own: draw it with the holder instead, so an
            # item is never a blank square. The glyph stays on the item as
            # the last resort if the holder is gone too.
            p = art.get("items/" + _PLACEHOLDER_ITEM)
            if p:
                it.pop("lineArt", None)
        if p:
            it["img"] = p
            if not it.get("lineArt"):
                it.pop("lineArt", None)
        else:
            it.pop("img", None)
            it.pop("lineArt", None)
        # Whether the picture is the item's own or the holder standing in for
        # it: the client shows the holder in a bag, but a list that means
        # something (the herbs) would rather have the leaf glyph.
        it["own_art"] = bool(own)


def icons_map():
    """Bare file name -> url for every icon on disk, for the UI chrome
    (sidebar tabs, empty doll slots, elixir slots). Missing files simply
    do not appear, and the client falls back to its text label."""
    return {k[len("icons/"):]: v for k, v in _asset_cache().items()
            if k.startswith("icons/")}

# Bonus gear/consumable drops merged into /api/areas (mob_id -> drops).
# Every gear piece needs a source: map a mob id to its item id.
#   "wild_rat": [("worn_iron_sword", 0.08, 1, 1)],
#
# The starter pack gear has no drop source on purpose -- it is mail-only.
_GEAR_DROPS = {
}


def areas_with_drops():
    out = []
    for a in AREAS:
        mobs = []
        for m in a["mobs"]:
            extra = [{"item": ITEM_BY_ID[i]["name"], "chance": c, "min": mn, "max": mx}
                     for (i, c, mn, mx) in _GEAR_DROPS.get(m["id"], [])
                     if i in ITEM_BY_ID]
            mobs.append({**m, "loot": m["loot"] + extra})
        out.append({**a, "mobs": mobs})
    return out

REALM_COST_BASE = 50.0
REALM_COST_GROWTH = 1.6  # per realm breakthrough

_QI_REFINEMENT_NUMERALS = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X")
# (realm suffix, major breakthrough, bottleneck insight attempts, flavor)
_QI_REFINEMENT_STAGES = (
    ("I", False, 0, "First breath of qi. The dantian stirs."),
    ("II", False, 0, "Meridians open like spring streams."),
    ("III", False, 0, "Qi pools steady. The body hardens."),
    ("IV", False, 0, "Night meditation deepens; senses sharpen."),
    ("V", False, 0, "Half-step threshold. The heart wavers."),
    ("VI", False, 1, "Bottleneck looms. Grind insight through circulation."),
    ("VII", False, 0, "Thunder rumbles far away. Heaven watches."),
    ("VIII", False, 1, "The dam is about to break. Temper the foundation."),
    ("IX", False, 1, "One step from the peak. The heavens take notice."),
    ("X", False, 0, "PEAK of Qi Refinement. Excess qi condenses into Dao Insight."),
)

def _build_realms():
    # Mortal (major breakthrough to step onto the Dao), then each
    # breakthrough advances straight to the next Qi Refinement Realm I-X.
    specs = [("Mortal", True, 0,
              "A mortal body of flesh and bone. Endure the tribulation and step onto the Dao.")]
    for numeral, major, bottleneck_req, flavor in _QI_REFINEMENT_STAGES:
        specs.append((f"Qi Refinement Realm {numeral}", major, bottleneck_req, flavor))
    realms = []
    for i, (realm, major, bottleneck_req, flavor) in enumerate(specs):
        realms.append({
            "idx": i,
            "name": realm,
            "realm": realm,
            "layer": 0,
            "cost": int(round(REALM_COST_BASE * (REALM_COST_GROWTH ** i))),
            "rate_mult": round(1.0 + REALM_RATE_STEP * i, 2),
            "major": major,
            "bottleneck_req": bottleneck_req,
            "flavor": flavor,
            "cap": i == len(specs) - 1,
        })
    return realms

REALMS = _build_realms()

def gear_qi_rate_pct(player):
    """Additive Qi-rate percentage from every valid equipped gear slot."""
    equipment = player.get("equipment") or {}
    if not isinstance(equipment, dict):
        return 0.0
    total = 0.0
    for slot in EQUIP_SLOTS:
        iid = equipment.get(slot)
        it = ITEM_BY_ID.get(iid)
        if not it or it.get("kind") != "gear":
            continue
        if not slot_accepts(it.get("slot"), slot):
            continue
        try:
            total += float((it.get("stats") or {}).get("qi_rate_pct", 0) or 0)
        except (TypeError, ValueError):
            continue
    return total


def effective_qi_multiplier(player):
    """Root Qi multiplier with the sum of equipped Qi-rate bonuses applied."""
    try:
        root_mult = float((player.get("stats") or {}).get("qi_mult", 1.0))
    except (TypeError, ValueError):
        root_mult = 1.0
    return max(0.0, root_mult) * max(0.0, 1.0 + gear_qi_rate_pct(player) / 100.0)


def stage_rate(player):
    """Authoritative Qi/sec for sync validation, including equipped gear."""
    try:
        idx = int(player.get("realm_idx", 0))
    except (TypeError, ValueError):
        idx = 0
    idx = max(0, min(idx, len(REALMS) - 1))
    mult = effective_qi_multiplier(player)
    mode = SECLUSION_MULT if player.get("seclusion") else 1.0
    return BASE_QI_PER_SEC * mult * REALMS[idx]["rate_mult"] * mode

def max_legit_cultivation(stored, elapsed):
    """Highest cultivation the client could honestly report."""
    if elapsed < 0:
        elapsed = 0
    online = min(elapsed, ONLINE_GRACE_SEC)
    offline = min(max(elapsed - ONLINE_GRACE_SEC, 0), OFFLINE_CAP_SEC)
    rate = stage_rate(stored)
    qi_mult = effective_qi_multiplier(stored)
    idle = rate * online + rate * offline * OFFLINE_EFF
    manual = MANUAL_ALLOW_MULT * qi_mult * online
    return float(stored.get("cultivation", 0)) + idle + manual

def pill_qi_used(stored, inv_in, hi_idx):
    """Qi actually granted by qi pills consumed since the last sync.
    Counted from the inventory delta so /api/sync never clamps honest pill use."""
    if not isinstance(inv_in, dict):
        return 0.0
    prev = stored.get("inventory") or {}
    if not isinstance(prev, dict):
        prev = {}
    hi = max(0, min(int(hi_idx or 0), len(REALMS) - 1))
    cost = REALMS[hi]["cost"]
    total = 0.0
    for k, it in ITEM_BY_ID.items():
        if it.get("kind") != "consumable":
            continue
        qi_pct = float((it.get("use") or {}).get("qi_pct") or 0)
        if qi_pct <= 0:
            continue
        try:
            before = max(0, int(prev.get(k, 0) or 0))
            after = max(0, int(inv_in.get(k, 0) or 0))
        except (TypeError, ValueError):
            continue
        if before > after:
            total += cost * qi_pct / 100.0 * (before - after)
    return total


ROLL_IP_TTL = 3600.0  # an IP's 1s roll cooldown is meaningless after an hour


def prune_roll_state(now):
    """Drop expired ROLLS and stale LAST_ROLL_BY_IP entries.

    Without this both dicts grow forever: ROLLS only shed an entry when the
    owner came back to spend it, so any roll abandoned or replayed past its
    5-minute window stayed resident for the life of the process.
    """
    for rid in [k for k, v in ROLLS.items() if v.get("expires", 0) <= now]:
        ROLLS.pop(rid, None)
    for ip in [k for k, t in LAST_ROLL_BY_IP.items() if now - t > ROLL_IP_TTL]:
        LAST_ROLL_BY_IP.pop(ip, None)


def max_affordable_realm(cultivation, start_idx, limit):
    """Highest realm reachable from `start_idx` with `cultivation` qi.

    Mirrors the client's advanceRealm exactly: each breakthrough spends only
    the current stage's cost and carries the surplus forward. A stage flagged
    cap is the peak of the ladder and is never left.
    """
    idx = int(start_idx)
    cult = float(cultivation)
    while idx < limit and not REALMS[idx].get("cap"):
        cost = REALMS[idx]["cost"]
        if cult < cost:
            break
        cult -= cost
        idx += 1
    return idx


def save_players():
    """Write the players file without ever leaving it half-written.

    The file is written to a temporary name and moved into place, so a crash
    (or a machine that loses power) cannot leave a truncated file where the
    cultivators were. The previous file is kept as players.json.bak, so a
    bad write can always be undone by hand.
    """
    path = os.path.join(BASE_DIR, "players.json")
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(PLAYERS, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        # Keep the last good file before replacing it.
        try:
            if os.path.exists(path):
                with open(path, "rb") as src, open(path + ".bak", "wb") as dst:
                    dst.write(src.read())
        except OSError:
            pass
        os.replace(tmp, path)
    except OSError:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass

def load_players():
    try:
        # utf-8-sig tolerates editors/tools that prepend a BOM
        with open(os.path.join(BASE_DIR, "players.json"), encoding="utf-8-sig") as f:
            data = json.load(f)
        if isinstance(data, dict):
            # Legacy saves predate spirit stones; back-fill before adoption.
            for p in data.values():
                if isinstance(p, dict):
                    p.setdefault("spirit_stones", 0)
                    p.setdefault("skills", [None] * SKILL_SLOTS)
                    m = p.setdefault("mastery", {})
                    for t in MASTERY_TRACKS:
                        m.setdefault(t, 0)
            PLAYERS.update(data)
            return len(data)
    except (OSError, ValueError):
        pass
    # The file is unreadable -- a truncated write, or a disk that gave up.
    # It is kept as it is (renamed aside) so nothing is silently destroyed,
    # and the server starts empty rather than pretending the players exist.
    path = os.path.join(BASE_DIR, "players.json")
    try:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            broken = path + ".corrupt"
            os.replace(path, broken)
            print("players.json could not be read -- kept as %s" % broken)
    except OSError:
        pass
    return 0

def weighted_roll_9():
    """Weighted sample without replacement: pick tier, then unpicked root in tier."""
    pool = list(ROOTS_WITH_CHANCE)
    picked = []
    rarities = list(RARITY_WEIGHTS.keys())
    weights = [RARITY_WEIGHTS[r] for r in rarities]
    attempts = 0
    while len(picked) < 9 and pool and attempts < 200:
        attempts += 1
        tier = random.choices(rarities, weights=weights, k=1)[0]
        candidates = [r for r in pool if r["rarity"] == tier and r not in picked]
        if not candidates:
            candidates = [r for r in pool if r not in picked]
        if not candidates:
            break
        picked.append(random.choice(candidates))
    return picked

def root_stats(roots):
    """The stats a set of roots grants.

    One place, so a fresh build and a re-apply always agree. Every stat here
    does something: qi_mult is the cultivation speed, comprehension and
    physique and fortune feed the combat numbers, and synergy_bonus is the
    reward for taking two roots of the same element.
    """
    roots = roots or []
    if not roots:
        return {"qi_mult": 1.0, "comprehension": 0, "physique": 0,
                "fortune": 0, "synergy_bonus": 0}
    avg_qi = round(sum(r.get("qi_mult", 1) for r in roots) / len(roots), 2)
    elems = [r.get("element") for r in roots]
    bonus = 0.2 if len(set(elems)) < len(elems) else 0.0
    return {
        "qi_mult": round(avg_qi + bonus, 2),
        "comprehension": sum(r.get("comprehension", 0) for r in roots),
        "physique": sum(r.get("physique", 0) for r in roots),
        "fortune": sum(r.get("fortune", 0) for r in roots),
        "synergy_bonus": bonus,
    }

def build_player(username, picks):
    roots = [ROOT_BY_ID[pid] for pid in picks]
    return {
        "username": username,
        "realm": "Mortal",
        "realm_idx": 0,
        "cultivation": 0,
        "cultivation_to_next": REALMS[0]["cost"],
        "bottleneck": 0,
        "dao_insight": 0,
        "spirit_stones": 0,
        "mastery": {t: 0 for t in MASTERY_TRACKS},
        "seclusion": False,
        "equipment": {s: None for s in EQUIP_SLOTS},
        "inventory": {},
        "elixirs": [None, None, None],
        "skills": [None] * SKILL_SLOTS,
        "mail": [],
        # Born into this version, so a new cultivator is not handed a patch
        # note for the build they started on.
        "patch_version": SERVER_VERSION,
        "hp": None,  # client-tracked; full on first load
        "last_seen": time.time(),
        "roots": roots,
        "stats": root_stats(roots),
    }


# ----------------------------------------------------------------------------
# Mail (patch notes / starter pack / maintenance rewards)
#
# Mail is server-held, so the client cannot grant itself an unclaimed reward:
# claiming is the only path that moves items into the inventory.
#
# Read rule: opening a mail marks it read, EXCEPT when it still carries
# unclaimed items -- an attachment stays unread until it is actually claimed,
# so the unread badge keeps pointing at it after you have looked inside.
# ----------------------------------------------------------------------------
MAIL_MAX = 50
STARTER_PACK = {
    # ---- Common armour set, one per slot
    "wooden_sword": 1, "wooden_shield": 1, "leather_helmet": 1,
    "leather_chest": 1, "leather_leggings": 1, "leather_bracers": 1,
    "leather_boots": 1, "leather_cape": 1,
    # ---- second batch: remaining equipment slots and balanced accessories
    "cracked_qi_stone": 1, "chipped_jade_pendant": 1,
    # Two copies per ring let players choose offense, defense, Qi, or hybrids.
    "copper_spirit_ring": 2, "jade_guard_ring": 2, "qi_gathering_ring": 2,
    # cloth_headband is a second, weaker head option alongside the helmet
    "cloth_headband": 1,
    # ---- supplies, so a new cultivator can actually heal and cultivate
    "minor_vitality_elixir": 3, "roasted_wild_rat_meat": 3, "minor_qi_pill": 2,
}


def _new_mail(kind, subject, body, items=None):
    """A fresh mail. Item mail starts unread and unclaimed; plain mail is
    read-on-arrival, since there is nothing left to open."""
    items = {k: int(v) for k, v in (items or {}).items() if k in ITEM_BY_ID}
    return {"id": uuid.uuid4().hex[:12], "kind": kind, "subject": subject,
            "body": body, "sent": time.time(), "items": items,
            "read": not items, "claimed": not items}


def _trim_mail(box):
    """Cap the mailbox, discarding only mail that is already read and claimed
    so a player can never lose an outstanding reward to the cap."""
    if len(box) <= MAIL_MAX:
        return
    for i, m in enumerate(box):
        if m.get("read") and m.get("claimed"):
            box.pop(i)
            if len(box) <= MAIL_MAX:
                return


def _deliver(stored, mail):
    box = stored.setdefault("mail", [])
    box.append(mail)
    box.sort(key=lambda m: m.get("sent", 0))
    _trim_mail(box)
    return mail


def _mail_unread(stored):
    return sum(1 for m in stored.get("mail", []) if not m.get("read"))


def _mail_pending_items(stored):
    """How many items are still waiting to be claimed in the mailbox."""
    total = 0
    for m in stored.get("mail", []):
        if m.get("claimed"):
            continue
        for n in (m.get("items") or {}).values():
            try:
                total += max(0, int(n))
            except (TypeError, ValueError):
                pass
    return total


def _find_mail(stored, mid):
    for m in stored.get("mail", []):
        if m.get("id") == mid:
            return m
    return None


def _send_starter_pack(stored):
    return _deliver(stored, _new_mail(
        "starter", "Newcomer Provisions",
        "The Ashen Sect sends a welcome kit to every new cultivator. "
        "Common equipment for every slot, plus offensive, defensive, and "
        "Qi-focused Spirit Rings so you can try different builds.\n\n"
        "Claim the kit, then equip your choices from the Bag.",
        STARTER_PACK))


def _ensure_patch_mail(stored, version):
    """Mail a patch note once per version. Players created on this version
    already have patch_version set, so they never get a retroactive note."""
    if stored.get("patch_version") == version:
        return None
    stored["patch_version"] = version
    return _deliver(stored, _new_mail(
        "patch", "Patch Notes",
        "Patch %s: equipment bonuses now add across all equipped slots, including both "
        "Spirit Ring slots. Qi Rate gear improves passive and offline "
        "cultivation as well as the displayed rate. This patch includes two "
        "copies each of an offensive, defensive, and Qi-focused ring so you "
        "can test double-ring and hybrid builds." % version,
        {"copper_spirit_ring": 2, "jade_guard_ring": 2,
         "qi_gathering_ring": 2}))


class Handler(BaseHTTPRequestHandler):
    server_version = "AshenFantasy/" + SERVER_VERSION

    def log_message(self, fmt, *args):
        pass  # quiet

    def _send_json(self, obj, status=200, cache=None):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cache:
            self.send_header("Cache-Control", cache)
        # No Access-Control-Allow-Origin: the game is served from this same
        # origin, so no cross-origin grant is ever needed. Echoing the request
        # Origin back would let any site the player visits read their save.
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0:
            return {}
        raw = self.rfile.read(n)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    # Cross-site guard. /api/* is state-changing and unauthenticated (a solo
    # game has no logins), so without this any page the player visits could
    # rewrite their save -- and binding to 127.0.0.1 does not stop that, since
    # the browser is the one making the request.
    #
    # Checking Origin matters more than omitting CORS headers: a cross-origin
    # POST with Content-Type: text/plain is a "simple request" that skips the
    # preflight entirely, so it would still be applied even though the attacker
    # could not read the reply. Only the Origin check stops the write.
    def _cross_origin(self):
        origin = self.headers.get("Origin")
        if not origin:
            return False  # curl / native clients / same-origin GET: not a browser attack
        host = self.headers.get("Host") or ""
        return origin not in ("http://" + host, "https://" + host)

    def _guard_api(self, path):
        """True if the request may proceed. Writes the refusal itself otherwise."""
        if not path.startswith("/api/"):
            return True
        if path == "/api/admin/command":
            return True  # checked separately, with its own token gate
        if self._cross_origin():
            self._send_json({"error": "cross-origin request refused"}, status=403)
            return False
        if MAINTENANCE["on"] and path in MAINTENANCE_BLOCKED:
            self._send_json({
                "error": "maintenance",
                "message": MAINTENANCE["message"],
            }, status=503)
            return False
        return True

    def _guard_admin(self):
        """Admin commands are local-only, and same-origin is already enforced by
        _cross_origin. Nothing shipped to the browser client can reach this."""
        host = self.headers.get("Host") or ""
        peer = self.client_address[0] if self.client_address else ""
        if peer not in ("127.0.0.1", "::1", "localhost"):
            self._send_json({"error": "admin is local-only"}, status=403)
            return False
        return True

    def do_OPTIONS(self):
        # Preflight only ever fires for cross-origin requests, all of which
        # _guard_api rejects, so there is nothing left to negotiate here.
        self.send_response(403)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not self._guard_api(path):
            return

        if path == "/api/roots":
            roots_sorted = sorted(ROOTS_WITH_CHANCE,
                                  key=lambda r: (RARITY_ORDER.index(r["rarity"]), r["name"]))
            return self._send_json({"roots": roots_sorted}, cache="max-age=3600")

        if path == "/api/areas":
            # Not cached: areas/mobs/drops/art are edited while building them
            # out, and a stale hour-old copy hides the change you just made.
            _apply_art(_asset_cache())
            return self._send_json({"areas": areas_with_drops()}, cache="no-store")

        if path == "/api/items":
            _apply_art(_asset_cache())
            return self._send_json({"items": ITEMS}, cache="no-store")

        if path == "/api/recipes":
            # The recipe table is static, but the art on it is resolved live
            # like every other picture, so a new PNG shows up on refresh.
            _apply_art(_asset_cache())
            recipes = []
            for r in RECIPES:
                out_it = ITEM_BY_ID.get(r["out"]) or {}
                out_rarity = out_it.get("rarity", "Common")
                out_tier = ITEM_RARITY_ORDER.index(out_rarity) if out_rarity in ITEM_RARITY_ORDER else 0
                cost = []
                for mid, need in r["cost"].items():
                    it = ITEM_BY_ID.get(mid)
                    if not it:
                        continue
                    cost.append({"id": mid, "need": need, "name": it["name"],
                                 "rarity": it["rarity"], "color": it.get("color", ""),
                                 "img": it.get("img", ""), "glyph": it.get("glyph", "✦")})
                recipes.append({
                    "id": r["id"], "out": r["out"], "count": r["count"],
                    "note": r["note"], "cost": cost,
                    "kind": _recipe_kind(r["out"]),
                    "max_count": CRAFT_MAX_COUNT,
                    "xp": MASTERY_XP_PER_CRAFT * (2 ** out_tier),
                    "out_name": out_it.get("name", r["out"]),
                    "out_rarity": out_rarity,
                    "out_img": out_it.get("img", ""),
                    "out_glyph": out_it.get("glyph", "✦"),
                })
            return self._send_json({"ok": True, "recipes": recipes}, cache="no-store")

        if path == "/api/skills":
            # The technique table. Static, so it may be cached a while.
            return self._send_json({"ok": True, "skills": skills_payload(),
                                    "slots": SKILL_SLOTS}, cache="max-age=3600")

        if path == "/api/herbs":
            # The herb table and where the player's herbalist rank stands.
            # The pictures are resolved live, like every other picture.
            _apply_art(_asset_cache())
            qs = parse_qs(parsed.query)
            username = (qs.get("username") or [""])[0].strip()
            stored = PLAYERS.get(username)
            xp = _mastery_xp(stored, "herbs") if stored else 0
            rank, within, rank_name = herb_rank_of(xp)
            # The rank gathers faster, so the panel must show the time the
            # player actually waits -- not the raw time of the herb.
            time_red, bonus, disc, disc_chance = herb_bonuses(xp)
            herbs = []
            for h in HERBS.values():
                need = int(HERB_UNLOCKS.get(h.get("rarity", "Common"), 1))
                base = float(h.get("time", 10) or 10)
                item = ITEM_BY_ID.get(h["id"]) or {}
                herbs.append({"id": h["id"], "name": h["name"], "rarity": h.get("rarity", "Common"),
                              "element": h.get("element", ""), "time": base,
                              "now": round(max(0.5, base * (1.0 - time_red)), 1),
                              "desc": h.get("desc") or "",
                              "img": item.get("img", "") if item.get("own_art") else "",
                              "need_rank": need, "locked": rank < need})
            return self._send_json({
                "ok": True, "herbs": herbs, "rank": rank, "level": within,
                "rank_name": rank_name, "xp": xp,
                "time_reduction": time_red, "bonus_chance": bonus,
                "levels_per_rank": HERB_LEVELS_PER_RANK,
            }, cache="no-store")

        if path == "/api/mastery":
            # The rank tables: the client draws the same names the server
            # hands out, so a rank can never read one way on one side.
            return self._send_json({
                "ok": True, "tracks": mastery_definitions(),
                "levels_per_rank": MASTERY_LEVELS_PER_RANK,
                "max_level": MASTERY_MAX_LEVEL,
            }, cache="max-age=3600")

        if path == "/api/icons":
            # UI chrome art (tabs, doll slots). Resolved per request so a new
            # PNG shows up on refresh, like item and enemy art.
            return self._send_json({"ok": True, "icons": icons_map()},
                                   cache="no-store")

        if path == "/api/health":
            # The mail count rides along with the poll, so the badge is live
            # without a second request.
            mail_unread = 0
            mail_new = 0
            qs = parse_qs(parsed.query)
            who = (qs.get("username") or [""])[0].strip()
            stored = PLAYERS.get(who)
            if stored:
                mail_unread = _mail_unread(stored)
                mail_new = _mail_pending_items(stored)
            return self._send_json({
                "ok": True, "roots": len(ROOTS_WITH_CHANCE),
                "version": self.server_version,
                "maintenance": {"on": MAINTENANCE["on"],
                                "message": MAINTENANCE["message"]},
                "announcement": ANNOUNCEMENT["text"],
                "restart_seq": RESTART_SEQ,
                "mail_unread": mail_unread, "mail_new": mail_new,
            })

        if path == "/api/mail":
            qs = parse_qs(parsed.query)
            username = (qs.get("username") or [""])[0].strip()
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            if _ensure_patch_mail(stored, SERVER_VERSION):
                save_players()
            return self._send_json({
                "ok": True,
                "mail": stored.get("mail", []),
                "unread": _mail_unread(stored),
                "new_items": _mail_pending_items(stored),
                "version": SERVER_VERSION,
            }, cache="no-store")

        if path == "/favicon.ico":
            # The sect's own mark, so the tab has an icon.
            return self._serve_file("favicon.ico", "image/x-icon")

        if path == "/api/realms":
            return self._send_json({"realms": REALMS}, cache="max-age=3600")

        if path == "/api/player":
            qs = parse_qs(parsed.query)
            username = (qs.get("username") or [""])[0].strip()
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            # hp is client-tracked and always null here — never echo it back
            return self._send_json(
                {"player": {k: v for k, v in stored.items() if k != "hp"},
                 "server_time": time.time()})

        # static files
        if path == "/" or path == "/index.html":
            return self._serve_file("index.html", "text/html; charset=utf-8")
        rel = path.lstrip("/")
        if (rel.startswith("css/") or rel.startswith("js/")
                or rel.startswith("assets/") or rel == "favicon.ico"):
            return self._serve_file(rel, None)
        if path.startswith("/api/"):
            return self._send_json({"error": "not found"}, status=404)
        # SPA fallback
        return self._serve_file("index.html", "text/html; charset=utf-8")

    def _serve_file(self, rel, content_type):
        # block traversal
        norm = os.path.normpath(rel).replace("\\", "/")
        if norm.startswith("..") or norm.startswith("/"):
            return self._send_json({"error": "forbidden"}, status=403)
        full = os.path.join(PUBLIC_DIR, norm)
        # The art is small WebP now, but a page or a style sheet may still
        # ask for the old .png name. The little picture is served under the
        # name that was asked for, so nothing breaks and nothing heavy is
        # ever sent.
        stem, ext = os.path.splitext(full)
        if ext.lower() in (".png", ".jpg", ".jpeg") and os.path.isfile(stem + ".webp"):
            full = stem + ".webp"
        if not os.path.isfile(full):
            # A font that has not been dropped in yet is not an error: the
            # page falls back to the system face, and the console stays
            # quiet.
            if ext.lower() in (".woff2", ".woff", ".ttf", ".otf"):
                self.send_response(204)
                self.end_headers()
                return
            return self._send_json({"error": "not found"}, status=404)
        if content_type is None:
            content_type, _ = mimetypes.guess_type(full)
            content_type = (content_type or "application/octet-stream")
            if content_type.startswith("text/") or full.endswith((".js", ".css", ".html", ".json")):
                content_type += "; charset=utf-8"
        try:
            with open(full, "rb") as f:
                body = f.read()
        except OSError:
            return self._send_json({"error": "read failed"}, status=500)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if rel.endswith((".html", ".css", ".js")):
            # The app's own files change with every build, and a cached copy
            # pairs a new page with old styles (or old script) -- which looks
            # like a bug in the game, not a stale cache. Always re-fetch.
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        ip = self.client_address[0] if self.client_address else "unknown"
        if not self._guard_api(path):
            return

        if path == "/api/roll":
            now = time.time()
            prune_roll_state(now)
            last = LAST_ROLL_BY_IP.get(ip, 0)
            if now - last < 1.0:
                return self._send_json({"error": "Rolling too fast. Breathe. (1s cooldown)"}, status=429)
            LAST_ROLL_BY_IP[ip] = now
            rolled = weighted_roll_9()
            roll_id = uuid.uuid4().hex[:12]
            ROLLS[roll_id] = {"offer": [r["id"] for r in rolled], "expires": now + 300, "ip": ip}
            return self._send_json({"roll_id": roll_id, "roots": rolled})

        if path == "/api/create":
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            roll_id = str(data.get("roll_id") or "")
            picks = data.get("picks") or []
            if not USERNAME_RE.match(username):
                return self._send_json({"error": "Username must be 3-16 chars: letters, numbers, _"}, status=400)
            if username in PLAYERS:
                # never silently overwrite an existing cultivator
                return self._send_json(
                    {"error": "That name already walks the jianghu. Continue that cultivator, or choose another."},
                    status=409)
            if not isinstance(picks, list) or len(picks) != 3 or len(set(picks)) != 3:
                return self._send_json({"error": "You must select exactly 3 distinct roots"}, status=400)
            roll = ROLLS.get(roll_id)
            if not roll:
                return self._send_json({"error": "Roll expired. Roll again."}, status=400)
            if time.time() > roll["expires"]:
                ROLLS.pop(roll_id, None)
                return self._send_json({"error": "Roll expired. Roll again."}, status=400)
            if any(pid not in roll["offer"] for pid in picks):
                return self._send_json({"error": "Selected roots not in this roll"}, status=400)
            if any(pid not in ROOT_BY_ID for pid in picks):
                return self._send_json({"error": "Unknown root id"}, status=400)
            player = build_player(username, picks)
            _send_starter_pack(player)
            PLAYERS[username] = player
            ROLLS.pop(roll_id, None)  # single use
            save_players()
            return self._send_json({"ok": True, "player": player})

        if path == "/api/admin/command":
            if not self._guard_admin():
                return
            data = self._read_json()
            token = str(data.get("token") or "")
            if ADMIN_TOKEN and token != ADMIN_TOKEN:
                return self._send_json({"error": "bad admin token"}, status=403)
            # Imported lazily so server.py stays importable on its own, and so
            # admin.py is unambiguously the single command table.
            import admin
            result = admin.dispatch(sys.modules[__name__],
                                    str(data.get("command") or ""))
            if result is False:
                return self._send_json({"error": "empty command"})
            ok, out = result
            if not ok:
                return self._send_json({"error": out})
            return self._send_json({"ok": True, "output": out})

        if path == "/api/mail/read":
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            m = _find_mail(stored, str(data.get("id") or ""))
            if not m:
                return self._send_json({"error": "No such mail"}, status=404)
            # An attachment stays unread until claimed, so the badge keeps
            # flagging it after the player has opened and read the body.
            held = bool(m.get("items")) and not m.get("claimed")
            if not held:
                m["read"] = True
                save_players()
            return self._send_json({
                "ok": True, "mail": m, "unread": _mail_unread(stored),
                "held": held,
            }, cache="no-store")

        if path == "/api/mail/claim":
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            m = _find_mail(stored, str(data.get("id") or ""))
            if not m:
                return self._send_json({"error": "No such mail"}, status=404)
            if m.get("claimed"):
                return self._send_json({"error": "Already claimed"}, status=400)
            granted = {}
            inv = stored.setdefault("inventory", {})
            for iid, n in (m.get("items") or {}).items():
                if iid not in ITEM_BY_ID:
                    continue
                try:
                    n = max(1, int(n))
                except (TypeError, ValueError):
                    continue
                granted[iid] = n
                inv[iid] = max(0, min(int(inv.get(iid, 0)) + n, 9999))
            # The client syncs its own bag every half minute, and that sync
            # carries whatever the bag held a moment ago. A grant that a
            # stale bag does not know about yet must not be wiped by it, so
            # the grant is remembered until the next sync confirms it.
            pending = stored.get("pending_grants") or {}
            for iid, n in granted.items():
                pending[iid] = max(int(pending.get(iid, 0) or 0), n)
            stored["pending_grants"] = pending
            # Claiming is what settles the mail: read and claimed together, so
            # it leaves the unread count even though opening it did not.
            m["claimed"] = True
            m["read"] = True
            save_players()
            return self._send_json({
                "ok": True, "mail": m, "unread": _mail_unread(stored),
                "new_items": _mail_pending_items(stored),
                "granted": granted, "inventory": inv,
            }, cache="no-store")

        if path == "/api/sell":
            # The buyer is server-side: the client asks for an item, the
            # server checks the bag, takes the goods and pays the stones.
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            if not USERNAME_RE.match(username):
                return self._send_json({"error": "Bad username"}, status=400)
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            item_id = str(data.get("item_id") or "")
            it = ITEM_BY_ID.get(item_id)
            if not it:
                return self._send_json({"error": "No such item"}, status=404)
            try:
                count = int(data.get("count", 1))
            except (TypeError, ValueError):
                count = 1
            count = max(1, min(count, 9999))
            inv = dict(stored.get("inventory") or {})
            have = int(inv.get(item_id, 0) or 0)
            if have <= 0:
                return self._send_json({"error": "You do not have that"}, status=400)
            count = min(count, have)
            earned = int(it.get("value", 0) or 0) * count
            left = have - count
            if left > 0:
                inv[item_id] = left
            else:
                inv.pop(item_id, None)
            stored["inventory"] = inv
            stored["spirit_stones"] = min(SPIRIT_STONE_CAP,
                                          int(stored.get("spirit_stones", 0) or 0) + earned)
            stored["last_seen"] = time.time()
            save_players()
            return self._send_json({
                "ok": True, "sold": item_id, "count": count, "earned": earned,
                "player": {k: v for k, v in stored.items() if k != "hp"},
            }, cache="no-store")

        if path == "/api/gather":
            # Gathering is server-side: the player picks a node, the server
            # checks the herbalist rank, works out the time and the yield,
            # and hands the herbs over.
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            if not USERNAME_RE.match(username):
                return self._send_json({"error": "Bad username"}, status=400)
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            herb_id = str(data.get("herb_id") or "")
            herb = HERBS.get(herb_id)
            if not herb:
                return self._send_json({"error": "No such herb"}, status=404)
            xp = _mastery_xp(stored, "herbs")
            rank, within, rank_name = herb_rank_of(xp)
            need_rank = int(HERB_UNLOCKS.get(herb.get("rarity", "Common"), 1))
            if rank < need_rank:
                return self._send_json(
                    {"error": "%s needs a %s rank" % (herb["name"], rank_name)},
                    status=400)
            time_red, bonus, disc, disc_chance = herb_bonuses(xp)
            base = float(herb.get("time", 10) or 10)
            seconds = max(0.5, base * (1.0 - time_red))
            inv = dict(stored.get("inventory") or {})
            gathered = {herb_id: 1}
            # Bonus herbs: the rank may find a second one.
            if bonus > 0 and random.random() < bonus:
                gathered[herb_id] = gathered.get(herb_id, 0) + 1
            # A discovery: something rarer turns up at the node.
            if disc and disc_chance > 0 and random.random() < disc_chance:
                pool = [h for h in HERBS.values() if h.get("rarity") == disc.get("rarity")]
                if pool:
                    found = random.choice(pool)
                    gathered[found["id"]] = gathered.get(found["id"], 0) + 1
            for iid, n in gathered.items():
                inv[iid] = max(0, min(int(inv.get(iid, 0) or 0) + n, 9999))
            stored["inventory"] = inv
            # The gathering itself teaches the herbalist track; rarer herbs
            # teach more.
            tier = HERB_RARITY_ORDER.index(herb.get("rarity", "Common")) \
                if herb.get("rarity") in HERB_RARITY_ORDER else 0
            _grant_mastery(stored, "herbs", HERB_XP_PER_GATHER * (2 ** tier))
            stored["last_seen"] = time.time()
            save_players()
            return self._send_json({
                "ok": True, "gathered": gathered, "next_ms": int(seconds * 1000),
                "mastery": mastery_payload(stored),
                "player": {k: v for k, v in stored.items() if k != "hp"},
            }, cache="no-store")

        if path == "/api/craft":
            # The forge is server-side on purpose: the client asks for a
            # recipe, the server checks the materials, spends them and hands
            # over the result. A client cannot craft for itself.
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            if not USERNAME_RE.match(username):
                return self._send_json({"error": "Bad username"}, status=400)
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            recipe = RECIPE_BY_ID.get(str(data.get("recipe_id") or ""))
            if not recipe:
                return self._send_json({"error": "No such recipe"}, status=404)
            try:
                count = int(data.get("count", 1))
            except (TypeError, ValueError):
                count = 1
            count = max(1, min(count, CRAFT_MAX_COUNT))
            inv = dict(stored.get("inventory") or {})
            # Every material must be on hand before anything is spent.
            for mid, need in recipe["cost"].items():
                have = int(inv.get(mid, 0) or 0)
                if have < need * count:
                    it = ITEM_BY_ID.get(mid) or {}
                    return self._send_json(
                        {"error": "Not enough %s (need %d, have %d)"
                                  % (it.get("name", mid), need * count, have)},
                        status=400)
            for mid, need in recipe["cost"].items():
                left = int(inv.get(mid, 0) or 0) - need * count
                if left > 0:
                    inv[mid] = left
                else:
                    inv.pop(mid, None)
            out_id = recipe["out"]
            if out_id not in ITEM_BY_ID:
                return self._send_json({"error": "Recipe output is unknown"}, status=500)
            made = recipe["count"] * count
            # The trade you work teaches its mastery, and every level of it
            # buys a chance to duplicate what you made. The rarer the work,
            # the more it teaches.
            bench = _recipe_kind(out_id)
            track = MASTERY_TRACK_FOR_BENCH[bench]
            rarity = (ITEM_BY_ID.get(out_id) or {}).get("rarity", "Common")
            tier = ITEM_RARITY_ORDER.index(rarity) if rarity in ITEM_RARITY_ORDER else 0
            # The XP follows the work: every item made teaches, and the rarer
            # the work the more it teaches.
            _grant_mastery(stored, track, MASTERY_XP_PER_CRAFT * (2 ** tier) * made)
            chance = track_bonus(track, _mastery_xp(stored, track))
            duplicated = chance > 0 and random.random() < chance
            inv[out_id] = max(0, min(int(inv.get(out_id, 0) or 0) + made * (2 if duplicated else 1), 9999))
            stored["inventory"] = inv
            stored["last_seen"] = time.time()
            save_players()
            return self._send_json({
                "ok": True, "crafted": out_id, "count": made,
                "kind": _recipe_kind(out_id),
                "duplicated": duplicated,
                "mastery": mastery_payload(stored),
                "player": {k: v for k, v in stored.items() if k != "hp"},
            }, cache="no-store")

        if path == "/api/mail/maintenance":
            # Admin trigger: mail a maintenance reward to every cultivator.
            # POST {"subject": ..., "body": ..., "items": {...}} -- optionally
            # "username" to target one player instead of all.
            data = self._read_json()
            subject = str(data.get("subject") or "").strip()[:80]
            body = str(data.get("body") or "").strip()[:4000]
            if not subject:
                return self._send_json({"error": "subject required"}, status=400)
            items_in = data.get("items") or {}
            items = {}
            if isinstance(items_in, dict):
                for k, v in items_in.items():
                    if k in ITEM_BY_ID:
                        try:
                            n = max(1, min(int(v), 999))
                        except (TypeError, ValueError):
                            continue
                        items[k] = n
            target = str(data.get("username") or "").strip()
            if target:
                targets = [target] if target in PLAYERS else []
            else:
                targets = list(PLAYERS.keys())
            if not targets:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            sent = 0
            for name in targets:
                _deliver(PLAYERS[name], _new_mail(
                    "maintenance", subject, body or subject, items))
                sent += 1
            save_players()
            return self._send_json({"ok": True, "sent": sent, "items": items})

        if path == "/api/adopt":
            # The server lost this cultivator -- its save file was wiped, or
            # it is a fresh server -- but the player still carries the
            # cultivator in their own save. They hand that save over once,
            # and the cultivator walks back into the world.
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            if not USERNAME_RE.match(username):
                return self._send_json({"error": "Bad username"}, status=400)
            if username in PLAYERS:
                return self._send_json(
                    {"error": "That cultivator already walks the jianghu.",
                     "exists": True}, status=409)
            save = data.get("player")
            if not isinstance(save, dict):
                return self._send_json({"error": "No save to adopt"}, status=400)
            # The roots come from the save when they are real roots, so the
            # cultivator keeps its own build.
            root_ids = [r.get("id") for r in (save.get("roots") or [])
                        if isinstance(r, dict) and r.get("id") in ROOT_BY_ID]
            if len(root_ids) != 3:
                root_ids = [r["id"] for r in random.sample(ROOTS, 3)]
            player = build_player(username, root_ids)
            try:
                player["cultivation"] = max(0.0, float(save.get("cultivation") or 0))
            except (TypeError, ValueError):
                player["cultivation"] = 0.0
            player["realm_idx"] = max(0, min(int(save.get("realm_idx") or 0), len(REALMS) - 1))
            player["bottleneck"] = max(0, int(save.get("bottleneck") or 0))
            player["dao_insight"] = max(0, int(save.get("dao_insight") or 0))
            player["spirit_stones"] = max(0, min(int(save.get("spirit_stones") or 0), SPIRIT_STONE_CAP))
            inv = {}
            for iid, n in (save.get("inventory") or {}).items():
                if iid in ITEM_BY_ID:
                    try:
                        inv[iid] = max(0, min(int(n), 9999))
                    except (TypeError, ValueError):
                        pass
            player["inventory"] = inv
            equipment = {s: None for s in EQUIP_SLOTS}
            for s, iid in (save.get("equipment") or {}).items():
                if s in EQUIP_SLOTS and iid in ITEM_BY_ID:
                    it = ITEM_BY_ID[iid]
                    if slot_accepts(it.get("slot"), s):
                        equipment[s] = iid
            player["equipment"] = equipment
            elixirs = [None] * 3
            for i, iid in enumerate((save.get("elixirs") or [])[:3]):
                if iid in ITEM_BY_ID and ITEM_BY_ID[iid].get("kind") == "consumable":
                    elixirs[i] = iid
            player["elixirs"] = elixirs
            skills = [s for s in (save.get("skills") or [])
                      if isinstance(s, str) and s in SKILLS][:SKILL_SLOTS]
            player["skills"] = skills + [None] * (SKILL_SLOTS - len(skills))
            mastery = {}
            for t in MASTERY_TRACKS:
                raw = (save.get("mastery") or {}).get(t, 0)
                if isinstance(raw, dict):
                    raw = raw.get("xp", 0)
                try:
                    mastery[t] = max(0, min(int(raw or 0), MASTERY_XP_CAP))
                except (TypeError, ValueError):
                    mastery[t] = 0
            player["mastery"] = mastery
            player["last_seen"] = time.time()
            PLAYERS[username] = player
            save_players()
            return self._send_json({"ok": True, "player": player}, cache="no-store")

        if path == "/api/sync":
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            if not USERNAME_RE.match(username):
                return self._send_json({"error": "Bad username"}, status=400)
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator. Create first."}, status=400)
            now = time.time()
            # Roots grant stats. A save that lost them (an old save, a
            # restore) gets them back from the roots it already carries.
            if not (stored.get("stats") or {}).get("qi_mult"):
                stored["stats"] = root_stats(stored.get("roots") or [])
            try:
                idx = int(data.get("realm_idx", stored.get("realm_idx", 0)))
            except (TypeError, ValueError):
                idx = int(stored.get("realm_idx", 0))
            idx = max(0, min(idx, len(REALMS) - 1))
            stored_idx = int(stored.get("realm_idx", 0))
            # elapsed from SERVER-side last_seen (client clock is untrusted)
            try:
                elapsed = now - float(stored.get("last_seen", now))
            except (TypeError, ValueError):
                elapsed = 0
            legit = max_legit_cultivation(stored, elapsed) + pill_qi_used(
                stored, data.get("inventory"), max(stored_idx, idx))
            try:
                claimed = max(0.0, float(data.get("cultivation", stored.get("cultivation", 0))))
            except (TypeError, ValueError):
                claimed = float(stored.get("cultivation", 0))
            clamped = claimed > legit
            cultivation = min(claimed, legit)
            # Breakthrough guard: realm_idx arrives from the client, so accept
            # only a realm the server itself says the player has paid for.
            if idx > stored_idx:
                # Gate on `legit`, never on the claimed cultivation.
                # advanceRealm already spends the cost before syncing, so the
                # client reports only the carried surplus; gating on that
                # figure would be circular, since an inflated claim would
                # satisfy the very check meant to reject it.
                reachable = max_affordable_realm(legit, stored_idx, len(REALMS) - 1)
                if idx > reachable:
                    idx = reachable
            stage = REALMS[idx]
            if idx > stored_idx:
                # breakthrough: the client already spent the stage cost and
                # carries the surplus into the new stage — do NOT deduct again
                bottleneck = 0
            else:
                idx = stored_idx
                stage = REALMS[idx]
                try:
                    bottleneck = max(0, int(data.get("bottleneck", stored.get("bottleneck", 0))))
                except (TypeError, ValueError):
                    bottleneck = 0
                bottleneck = min(bottleneck, stage["bottleneck_req"])
            dao_insight = int(stored.get("dao_insight", 0))
            try:
                extra_insight = int(data.get("dao_insight", dao_insight))
            except (TypeError, ValueError):
                extra_insight = dao_insight
            if stage["cap"]:
                # peak of the ladder: overflow condenses into Dao Insight
                while cultivation >= stage["cost"]:
                    cultivation -= stage["cost"]
                    dao_insight += 1
            # insight is monotonic: the client may condense several times
            # between syncs (a +1 clamp would roll honest progress back)
            dao_insight = max(dao_insight, extra_insight)
            # Spirit stones are granted per kill client-side (like loot rolls),
            # so the balance is monotonic: a lower claim is a rollback, never
            # an honest spend — there is no spend path yet. Cap forgeries.
            stones_stored = int(stored.get("spirit_stones", 0) or 0)
            try:
                stones_claimed = int(data.get("spirit_stones", stones_stored))
            except (TypeError, ValueError):
                stones_claimed = stones_stored
            stones_claimed = max(0, min(stones_claimed, SPIRIT_STONE_CAP))
            spirit_stones = max(stones_stored, stones_claimed)
            # Battle mastery: the client earns it on the kill and reports it
            # with the save. Monotonic, like the stones.
            mastery = stored.setdefault("mastery", {})
            for t in MASTERY_TRACKS:
                mastery.setdefault(t, 0)
            battle_xp = int(mastery.get("battle") or 0)
            try:
                claimed_battle = int(data.get("mastery_battle", battle_xp))
            except (TypeError, ValueError):
                claimed_battle = battle_xp
            battle_xp = max(battle_xp, max(0, min(claimed_battle, MASTERY_XP_CAP)))
            mastery["battle"] = battle_xp
            # equipment / inventory / elixirs: accept only known items in valid slots
            equip_in = data.get("equipment") or {}
            equipment = {s: None for s in EQUIP_SLOTS}
            if isinstance(equip_in, dict):
                for s in EQUIP_SLOTS:
                    iid = equip_in.get(s)
                    if iid in ITEM_BY_ID:
                        it = ITEM_BY_ID[iid]
                        if slot_accepts(it["slot"], s):
                            equipment[s] = iid
            inventory = {}
            inv_in = data.get("inventory") or {}
            if isinstance(inv_in, dict):
                for k, v in inv_in.items():
                    if k in ITEM_BY_ID:
                        try:
                            inventory[k] = max(0, min(int(v), 9999))
                        except (TypeError, ValueError):
                            pass
            # A grant from the mailbox that this bag does not know about yet
            # (the client syncs the bag it had a moment ago) is not lost: it
            # waits here until the bag carries it. After this sync the grant
            # is settled, and the bag alone decides what is in the bag.
            pending = stored.pop("pending_grants", None) or {}
            for k, v in pending.items():
                if k in ITEM_BY_ID and int(inventory.get(k, 0) or 0) < int(v or 0):
                    inventory[k] = int(v or 0)
            elixirs = [None, None, None]
            elix_in = data.get("elixirs") or []
            if isinstance(elix_in, list):
                seen_elix = set()
                for i, x in enumerate(elix_in[:3]):
                    # one pill per named slot: first occurrence wins
                    if x in ITEM_BY_ID and ITEM_BY_ID[x]["kind"] == "consumable" and x not in seen_elix:
                        seen_elix.add(x)
                        elixirs[i] = x
            # techniques: only known techniques, one per slot, no duplicates
            skills = [None] * SKILL_SLOTS
            skill_in = data.get("skills") or []
            if isinstance(skill_in, list):
                seen_sk = set()
                for i, x in enumerate(skill_in[:SKILL_SLOTS]):
                    if x in SKILLS and x not in seen_sk:
                        seen_sk.add(x)
                        skills[i] = x
            stored.update({
                "realm": stage["name"],
                "realm_idx": idx,
                "cultivation": cultivation,
                "cultivation_to_next": stage["cost"],
                "bottleneck": bottleneck,
                "dao_insight": dao_insight,
                "spirit_stones": spirit_stones,
                "mastery": mastery,
                "seclusion": bool(data.get("seclusion", stored.get("seclusion", False))),
                "equipment": equipment,
                "inventory": inventory,
                "elixirs": elixirs,
                "skills": skills,
                "last_seen": now,
            })
            save_players()
            # hp is client-tracked and always null here — never echo it back
            return self._send_json({
                "ok": True,
                "player": {k: v for k, v in stored.items() if k != "hp"},
                "server_time": now, "clamped": clamped,
            })

        return self._send_json({"error": "not found"}, status=404)


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Ashen Fantasy server (stdlib only)")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    loaded = load_players()
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Ashen Fantasy serving at http://{args.host}:{args.port}")
    print(f"Serving static from: {PUBLIC_DIR} ({loaded} saved cultivators loaded)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")


if __name__ == "__main__":
    main()
