"""
Ashen Fantasy - Text Based Cultivation RPG
Python stdlib only server (no pip install needed).

Run:  python server.py  [--port 8000]
Serves: public/ at /  + JSON API at /api/*
"""
import json
import random
import re
import time
import uuid
import os
import mimetypes
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

# ----------------------------------------------------------------------------
# Hunting areas (single source of truth; served via GET /api/areas)
# req_idx gates by player realm. Loot rolls are client-side; Qi rewards flow
# through accrue() and the /api/sync clamp like any other honest gain.
# ----------------------------------------------------------------------------
def _mob(id, name, realm, desc, glyph, hp, atk, dfn, speed, qi, loot):
    return {"id": id, "name": name, "realm": realm, "desc": desc, "glyph": glyph,
            "hp": hp, "atk": atk, "def": dfn, "crit": 5, "crit_dmg": 150,
            "speed": speed, "qi": qi, "loot": loot}

def _loot(item, chance, mn, mx):
    return {"item": item, "chance": chance, "min": mn, "max": mx}

AREAS = [
    {"id": "misty_valley", "name": "Misty Mortal Valley", "req_idx": 0,
     "req": "Mortal", "difficulty": "Easy",
     "desc": "Low mists, weak beasts. A safe first hunt for a new cultivator.",
     "mobs": [
        _mob("stone_puppet", "Stone Puppet", "Mortal construct",
             "A training puppet left by a fallen sect. Slow, sturdy, harmless.",
             "🗿", 80, 8, 2, 1.6, 6,
             [_loot("Iron", 0.6, 1, 2), _loot("Stone", 0.5, 1, 2)]),
        _mob("ash_rat", "Ash Rat", "Mortal beast",
             "Fat rat nesting in cremation ashes. Fast, cowardly, crunchy.",
             "🐀", 35, 4, 0, 0.9, 3,
             [_loot("Cinder", 0.5, 1, 1), _loot("Rat Fang", 0.3, 1, 1)]),
        _mob("mud_crab", "Mud Crab", "Mortal beast",
             "Sideways menace of the mudflats. Thick shell, soft heart.",
             "🦀", 50, 5, 3, 1.8, 4,
             [_loot("Crab Shell", 0.6, 1, 2), _loot("Mud Pearl", 0.15, 1, 1)]),
        _mob("dust_wolf", "Dust Wolf", "Mortal beast",
             "Thin wolf prowling the grave roads. Hungry enough to try you.",
             "🐺", 60, 7, 1, 1.3, 5,
             [_loot("Wolf Fang", 0.5, 1, 2), _loot("Hide", 0.4, 1, 1)]),
        _mob("sprout_treant", "Sprout Treant", "Mortal spirit",
             "A grumpy sapling that woke up wrong. Swings branches wildly.",
             "🌱", 70, 6, 2, 1.7, 5,
             [_loot("Spirit Wood", 0.55, 1, 2), _loot("Dewdrop", 0.3, 1, 1)]),
     ]},
    {"id": "bamboo_forest", "name": "Whispering Bamboo Forest", "req_idx": 3,
     "req": "Qi Refinement Realm III", "difficulty": "Normal",
     "desc": "Wind talks through green stalks. Things with teeth listen.",
     "mobs": [
        _mob("bamboo_viper", "Bamboo Viper", "Refinement beast",
             "Green as the stalks it hides in. Strikes before the hiss.",
             "🐍", 160, 13, 5, 1.1, 10,
             [_loot("Venom Gland", 0.5, 1, 1), _loot("Snakeskin", 0.45, 1, 2)]),
        _mob("ironback_boar", "Ironback Boar", "Refinement beast",
             "Charges first, thinks never. Its back can turn a blade.",
             "🐗", 260, 16, 8, 1.7, 14,
             [_loot("Iron Tusk", 0.5, 1, 2), _loot("Boar Hide", 0.4, 1, 2)]),
        _mob("mist_gibbon", "Mist Gibbon", "Refinement beast",
             "Swings laughing through the fog. Drops fruit, and fists.",
             "🐒", 180, 14, 4, 1.0, 12,
             [_loot("Spirit Fruit", 0.4, 1, 2), _loot("Misty Pelt", 0.4, 1, 1)]),
        _mob("thorn_panther", "Thorn Panther", "Refinement beast",
             "A shadow with thorns for whiskers. You will not see it first.",
             "🐆", 240, 18, 6, 1.2, 16,
             [_loot("Panther Claw", 0.5, 1, 2), _loot("Thorn Vine", 0.35, 1, 2)]),
        _mob("bamboo_wraith", "Bamboo Wraith", "Refinement spirit",
             "The grudge of a felled grove, rattling like dry leaves.",
             "👻", 200, 15, 3, 1.4, 18,
             [_loot("Wraith Wisp", 0.4, 1, 1), _loot("Spirit Sliver", 0.3, 1, 1)]),
     ]},
    {"id": "ember_caverns", "name": "Ember Caverns", "req_idx": 6,
     "req": "Qi Refinement Realm VI", "difficulty": "Hard",
     "desc": "The stone breathes heat. Everything down here is angry.",
     "mobs": [
        _mob("flame_imp", "Flame Imp", "Refinement fiend",
             "Small, rude, flammable-adjacent. Throws cinders at guests.",
             "😈", 420, 25, 10, 1.1, 30,
             [_loot("Imp Horn", 0.5, 1, 1), _loot("Ember", 0.6, 1, 3)]),
        _mob("magma_lizard", "Magma Lizard", "Refinement beast",
             "Basks in lava flows. Its scales still glow at midnight.",
             "🦎", 550, 28, 14, 1.6, 38,
             [_loot("Magma Scale", 0.5, 1, 2), _loot("Fire Gland", 0.35, 1, 1)]),
        _mob("cinder_golem", "Cinder Golem", "Refinement construct",
             "A furnace given fists. Slow, inevitable, extremely hot.",
             "🗿", 700, 32, 16, 2.0, 48,
             [_loot("Cinder Core", 0.4, 1, 1), _loot("Obsidian Shard", 0.45, 1, 2)]),
        _mob("ash_wraith", "Ash Wraith", "Refinement spirit",
             "What the volcano buried, the volcano remembers.",
             "🌫️", 480, 30, 8, 1.3, 42,
             [_loot("Ashen Veil", 0.35, 1, 1), _loot("Grudge Ember", 0.4, 1, 1)]),
        _mob("inferno_bat", "Inferno Bat", "Refinement beast",
             "A screech with wings, trailing sparks through black tunnels.",
             "🦇", 400, 26, 6, 0.9, 34,
             [_loot("Bat Wing", 0.5, 1, 2), _loot("Searing Blood", 0.3, 1, 2)]),
     ]},
    {"id": "frostbite_peaks", "name": "Frostbite Peaks", "req_idx": 8,
     "req": "Qi Refinement Realm VIII", "difficulty": "Brutal",
     "desc": "White silence that kills the unprepared. Only apex predators.",
     "mobs": [
        _mob("frost_alpha", "Frost Wolf Alpha", "Refinement alpha",
             "Leads the blizzard pack. Its howl freezes marrow.",
             "🐺", 950, 42, 18, 1.3, 70,
             [_loot("Alpha Fang", 0.5, 1, 2), _loot("Frost Pelt", 0.45, 1, 2)]),
        _mob("ice_revenant", "Ice Revenant", "Refinement spirit",
             "A frozen cultivator that never stopped climbing.",
             "🧊", 1100, 46, 22, 1.7, 85,
             [_loot("Revenant Shard", 0.4, 1, 1), _loot("Glacial Core", 0.3, 1, 1)]),
        _mob("snow_yak", "Snow Yak Demon", "Refinement beast",
             "A mountain that moos. Gore first, questions later.",
             "🐂", 1400, 50, 26, 2.0, 100,
             [_loot("Yak Horn", 0.45, 1, 2), _loot("Snow Lotus", 0.25, 1, 1)]),
        _mob("blizzard_roc", "Blizzard Roc", "Refinement beast",
             "Its wings are the storm. Its shadow is the last thing many see.",
             "🦅", 1000, 48, 16, 1.0, 90,
             [_loot("Roc Feather", 0.5, 1, 3), _loot("Storm Eye", 0.2, 1, 1)]),
        _mob("frozen_jiao", "Frozen Jiao", "Refinement dragon-kin",
             "A river dragon flash-frozen mid-ascent. Proud, ancient, furious.",
             "🐉", 1500, 55, 24, 1.5, 140,
             [_loot("Jiao Scale", 0.4, 1, 2), _loot("Dragon Dew", 0.2, 1, 1)]),
     ]},
]
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

def stage_rate(player):
    """Authoritative Qi/sec for sync validation."""
    try:
        idx = int(player.get("realm_idx", 0))
    except (TypeError, ValueError):
        idx = 0
    idx = max(0, min(idx, len(REALMS) - 1))
    try:
        mult = float(player.get("stats", {}).get("qi_mult", 1.0))
    except (TypeError, ValueError):
        mult = 1.0
    mode = SECLUSION_MULT if player.get("seclusion") else 1.0
    return BASE_QI_PER_SEC * mult * REALMS[idx]["rate_mult"] * mode

def max_legit_cultivation(stored, elapsed):
    """Highest cultivation the client could honestly report."""
    if elapsed < 0:
        elapsed = 0
    online = min(elapsed, ONLINE_GRACE_SEC)
    offline = min(max(elapsed - ONLINE_GRACE_SEC, 0), OFFLINE_CAP_SEC)
    rate = stage_rate(stored)
    qi_mult = float(stored.get("stats", {}).get("qi_mult", 1.0))
    idle = rate * online + rate * offline * OFFLINE_EFF
    manual = MANUAL_ALLOW_MULT * qi_mult * online
    return float(stored.get("cultivation", 0)) + idle + manual

def save_players():
    try:
        with open(os.path.join(BASE_DIR, "players.json"), "w", encoding="utf-8") as f:
            json.dump(PLAYERS, f, ensure_ascii=False, indent=2)
    except OSError:
        pass

def load_players():
    try:
        # utf-8-sig tolerates editors/tools that prepend a BOM
        with open(os.path.join(BASE_DIR, "players.json"), encoding="utf-8-sig") as f:
            data = json.load(f)
        if isinstance(data, dict):
            PLAYERS.update(data)
            return len(data)
    except (OSError, ValueError):
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

def build_player(username, picks):
    roots = [ROOT_BY_ID[pid] for pid in picks]
    avg_qi = round(sum(r["qi_mult"] for r in roots) / len(roots), 2)
    # synergy: same element bonus
    elems = [r["element"] for r in roots]
    bonus = 0.2 if len(set(elems)) < len(elems) else 0.0
    stats = {
        "qi_mult": round(avg_qi + bonus, 2),
        "comprehension": sum(r["comprehension"] for r in roots),
        "physique": sum(r["physique"] for r in roots),
        "fortune": sum(r["fortune"] for r in roots),
        "synergy_bonus": bonus,
    }
    return {
        "username": username,
        "realm": "Mortal",
        "realm_idx": 0,
        "cultivation": 0,
        "cultivation_to_next": REALMS[0]["cost"],
        "bottleneck": 0,
        "dao_insight": 0,
        "seclusion": False,
        "last_seen": time.time(),
        "roots": roots,
        "stats": stats,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "AshenFantasy/0.6.1"

    def log_message(self, fmt, *args):
        pass  # quiet

    def _send_json(self, obj, status=200, cache=None):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cache:
            self.send_header("Cache-Control", cache)
        self.send_header("Access-Control-Allow-Origin", "*")
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

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/roots":
            roots_sorted = sorted(ROOTS_WITH_CHANCE,
                                  key=lambda r: (RARITY_ORDER.index(r["rarity"]), r["name"]))
            return self._send_json({"roots": roots_sorted}, cache="max-age=3600")

        if path == "/api/areas":
            return self._send_json({"areas": AREAS}, cache="max-age=3600")

        if path == "/api/health":
            return self._send_json({"ok": True, "roots": len(ROOTS_WITH_CHANCE),
                                    "version": self.server_version})

        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if path == "/api/realms":
            return self._send_json({"realms": REALMS}, cache="max-age=3600")

        if path == "/api/player":
            qs = parse_qs(parsed.query)
            username = (qs.get("username") or [""])[0].strip()
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator"}, status=404)
            return self._send_json({"player": stored, "server_time": time.time()})

        # static files
        if path == "/" or path == "/index.html":
            return self._serve_file("index.html", "text/html; charset=utf-8")
        rel = path.lstrip("/")
        if rel.startswith("css/") or rel.startswith("js/") or rel.startswith("assets/"):
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
        if not os.path.isfile(full):
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
        if rel.endswith((".css", ".js")):
            self.send_header("Cache-Control", "max-age=3600")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        ip = self.client_address[0] if self.client_address else "unknown"

        if path == "/api/roll":
            now = time.time()
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
            PLAYERS[username] = player
            ROLLS.pop(roll_id, None)  # single use
            save_players()
            return self._send_json({"ok": True, "player": player})

        if path == "/api/sync":
            data = self._read_json()
            username = str(data.get("username") or "").strip()
            if not USERNAME_RE.match(username):
                return self._send_json({"error": "Bad username"}, status=400)
            stored = PLAYERS.get(username)
            if not stored:
                return self._send_json({"error": "Unknown cultivator. Create first."}, status=400)
            now = time.time()
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
            legit = max_legit_cultivation(stored, elapsed)
            try:
                claimed = max(0.0, float(data.get("cultivation", stored.get("cultivation", 0))))
            except (TypeError, ValueError):
                claimed = float(stored.get("cultivation", 0))
            clamped = claimed > legit
            cultivation = min(claimed, legit)
            stage = REALMS[idx]
            if idx > stored_idx:
                # breakthrough between syncs: consume only the old stage cost,
                # surplus Qi carries into the new stage
                cultivation = max(0.0, cultivation - REALMS[stored_idx]["cost"])
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
                # client breakthrough click may report one insight ahead of sync
                dao_insight = max(dao_insight, min(extra_insight, dao_insight + 1))
            stored.update({
                "realm": stage["name"],
                "realm_idx": idx,
                "cultivation": cultivation,
                "cultivation_to_next": stage["cost"],
                "bottleneck": bottleneck,
                "dao_insight": dao_insight,
                "seclusion": bool(data.get("seclusion", stored.get("seclusion", False))),
                "last_seen": now,
            })
            save_players()
            return self._send_json({
                "ok": True, "player": stored,
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
