"""Ashen Fantasy API regression tests (python stdlib only).

Runs the real server in-process on an ephemeral port. players.json is
never read or written (save is stubbed out before any request).
Run: python tests/test_api.py"""
import json
import os
import re
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

# Never touch the real save file, and start from a clean slate.
server.save_players = lambda: None
server.PLAYERS.clear()
server.ROLLS.clear()
server.LAST_ROLL_BY_IP.clear()

passed = 0
failed = 0


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print("PASS  " + label)
    else:
        failed += 1
        print("FAIL  " + label)


srv = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()


def req(path, payload=None):
    url = "http://127.0.0.1:%d%s" % (PORT, path)
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    r = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def roll():
    server.LAST_ROLL_BY_IP.clear()  # tests may roll faster than players can
    st, j = req("/api/roll", {})
    return st, j


def new_player(name):
    st, r = roll()
    assert st == 200, "roll failed: %s" % r
    picks = [x["id"] for x in r["roots"][:3]]
    st, j = req("/api/create", {"username": name, "roll_id": r["roll_id"], "picks": picks})
    assert st == 200, "create failed: %s" % j
    return j["player"]


def sync(username, **fields):
    body = {"username": username, "realm_idx": 0, "cultivation": 0,
            "bottleneck": 0, "dao_insight": 0, "seclusion": False,
            "equipment": {}, "inventory": {}, "elixirs": [None, None, None]}
    body.update(fields)
    return req("/api/sync", body)


def fresh(name, **stored_fields):
    """Create a player, then pin last_seen so idle accrual is ~zero."""
    p = new_player(name)
    server.PLAYERS[name].update(stored_fields)
    server.PLAYERS[name]["last_seen"] = time.time()
    return p


try:
    # ============ 1. version consistency across the three files ============
    with open(os.path.join(ROOT, "server.py"), encoding="utf-8") as f:
        srv_src = f.read()
    with open(os.path.join(ROOT, "public", "js", "app.js"), encoding="utf-8") as f:
        js_src = f.read()
    with open(os.path.join(ROOT, "public", "index.html"), encoding="utf-8") as f:
        html_src = f.read()
    with open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8") as f:
        md_src = f.read()
    v_srv = re.search(r'server_version = "AshenFantasy/([\d.]+)"', srv_src).group(1)
    v_js = re.search(r'CLIENT_VERSION = "([\d.]+)"', js_src).group(1)
    v_html = re.search(r'Ashen Fantasy v([\d.]+)', html_src).group(1)
    ok(v_srv == v_js == v_html, "server/client/footer versions match (%s)" % v_srv)
    ok(("## [%s]" % v_srv) in md_src, "CHANGELOG has an entry for %s" % v_srv)

    st, j = req("/api/health")
    ok(st == 200 and j.get("ok") is True, "health endpoint is ok")
    ok(j.get("version") == "AshenFantasy/" + v_srv, "health version matches server_version")

    # ============ 2. content endpoints ============
    st, j = req("/api/roots")
    ok(st == 200 and len(j.get("roots", [])) == 21, "roots served (21)")
    st, j = req("/api/areas")
    ok(st == 200 and len(j.get("areas", [])) > 0, "areas served")
    st, j = req("/api/items")
    ok(st == 200 and len(j.get("items", [])) > 0, "items served")
    st, j = req("/api/realms")
    ok(st == 200 and len(j.get("realms", [])) > 0, "realms served")

    # ============ 2b. art is resolved by id, live, with an emoji fallback ============
    # Adding a PNG must show up on the next request without a server restart.
    st, j = req("/api/areas")
    mobs = [m for a in j["areas"] for m in a["mobs"]]
    with_art = [m for m in mobs if m.get("img")]
    ok(len(with_art) == len(mobs), "every enemy resolves a matching art file")
    ok(all(m["img"] == "/assets/enemies/%s.png" % m["id"] for m in with_art),
       "enemy art path is derived from the mob id")
    st, j = req("/api/items")
    with_art = [i for i in j["items"] if i.get("img")]
    ok(len(with_art) > 0, "items resolve art files")
    ok(all(i["img"] == "/assets/items/%s.png" % i["id"] for i in with_art),
       "item art path is derived from the item id")
    ok(all(i["img"].startswith("/assets/") and ".." not in i["img"] for i in with_art),
       "art paths stay inside the assets folder")
    no_art = [i for i in j["items"] if not i.get("img")]
    ok(all(i.get("glyph") for i in no_art), "every item without art still has an emoji glyph")

    # Live pickup: a file dropped in after startup must be picked up.
    probe_dir = os.path.join(server.PUBLIC_DIR, "assets", "items")
    probe = os.path.join(probe_dir, "__probe_test__.png")
    st, before = req("/api/items")
    before_art = len([i for i in before["items"] if i.get("img")])
    try:
        shutil.copyfile(os.path.join(probe_dir, "rat_fur.png"), probe)
        st, after = req("/api/items")
        ok(len([i for i in after["items"] if i.get("img")]) == before_art,
           "an unreferenced png does not attach art to any item")
    finally:
        if os.path.exists(probe):
            os.remove(probe)

    # ============ 2c. item rarity ladder ============
    # Items use Common -> Mythic; the Mortal -> Primordial ladder belongs to
    # Spiritual Roots only and must never leak into item data.
    tiers = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"]
    colors = {"Common": "#9aa0a6", "Uncommon": "#7cb342", "Rare": "#42a5f5",
              "Epic": "#ab47bc", "Legendary": "#ffb300", "Mythic": "#ff3d00"}
    ok(server.ITEM_RARITY_ORDER == tiers, "item rarity order is Common -> Mythic")
    ok(server.ITEM_RARITY_COLORS == colors, "item rarity colors match the spec")
    ok(not (set(server.ITEM_RARITY_ORDER) & set(server.RARITY_ORDER)),
       "the item ladder and the root ladder share no names")
    st, j = req("/api/items")
    ok(all(i["rarity"] in tiers for i in j["items"]),
       "every item carries a valid Common->Mythic rarity")
    ok(all(i["rarity"] == "Common" or i.get("color") == colors[i["rarity"]] for i in j["items"]),
       "every item ships its rarity color")
    mats = [i for i in j["items"] if i["kind"] == "material"]
    ok(any(i["rarity"] == "Rare" for i in mats) and any(i["rarity"] == "Common" for i in mats),
       "materials span more than one rarity")
    st, j = req("/api/areas")
    drops = [l for a in j["areas"] for m in a["mobs"] for l in m["loot"]]
    ok(drops and all(l["rarity"] in tiers for l in drops),
       "every drop row carries a valid rarity")
    # A material's rarity must be the best rarity any beast drops it under.
    want = {}
    for l in drops:
        if l["rarity"] not in want or tiers.index(l["rarity"]) > tiers.index(want[l["item"]]):
            want[l["item"]] = l["rarity"]
    got = {i["name"]: i["rarity"] for i in mats}
    ok(all(got.get(k) == v for k, v in want.items()),
       "each material's rarity equals the highest rarity it drops under")
    # Rarity and drop chance are independent, so a Rare item may still be common.
    rare_or_better = [l for l in drops if tiers.index(l["rarity"]) >= tiers.index("Rare")]
    ok(rare_or_better and max(l["chance"] for l in rare_or_better) >= 0.5,
       "at least one Rare+ item drops often, as the spec allows")

    # ============ 3. roll cooldown ============
    st, _ = roll()
    ok(st == 200, "first roll succeeds")
    st, j = req("/api/roll", {})
    ok(st == 429, "second roll within 1s is rate-limited")

    # ============ 4. create: happy path + duplicate 409 ============
    p = new_player("sage_one")
    ok(p["realm_idx"] == 0 and len(p["roots"]) == 3, "create builds a fresh cultivator")
    ok(p.get("hp") is None, "created player hp is null (client-tracked)")
    server.LAST_ROLL_BY_IP.clear()
    _, r2 = roll()
    st, j = req("/api/create", {"username": "sage_one", "roll_id": r2["roll_id"],
                                "picks": [x["id"] for x in r2["roots"][:3]]})
    ok(st == 409 and "jianghu" in j.get("error", ""), "duplicate username is rejected with 409")

    # ============ 5. GET /api/player: 404 + hp never echoed ============
    st, j = req("/api/player?username=nobody_here")
    ok(st == 404, "unknown cultivator 404s")
    server.PLAYERS["sage_one"]["hp"] = 555  # stale client hp parked server-side
    st, j = req("/api/player?username=sage_one")
    ok(st == 200 and "hp" not in j["player"], "GET /api/player never echoes hp")

    # ============ 6. breakthrough: client surplus survives (no double deduct) ============
    fresh("bt_carrier")
    cost0 = server.REALMS[0]["cost"]
    server.PLAYERS["bt_carrier"]["cultivation"] = cost0 + 10
    server.PLAYERS["bt_carrier"]["last_seen"] = time.time()
    st, j = sync("bt_carrier", realm_idx=1, cultivation=10,
                 inventory=dict(server.PLAYERS["bt_carrier"]["inventory"]))
    ok(st == 200 and j["clamped"] is False, "breakthrough surplus is not clamped")
    ok(abs(j["player"]["cultivation"] - 10) < 0.01,
       "breakthrough stores exactly the carried surplus (cost spent once)")
    ok(j["player"]["realm_idx"] == 1 and j["player"]["realm"] == server.REALMS[1]["name"],
       "breakthrough advances the realm server-side")

    # ============ 7. qi pill inventory delta = allowance, not a cheat ============
    fresh("pill_user", cultivation=100, inventory={"spirit_meal": 3, "qi_pill": 2})
    cost0 = server.REALMS[0]["cost"]
    claim = 100 + cost0 * 0.15
    st, j = sync("pill_user", cultivation=claim,
                 inventory={"spirit_meal": 3, "qi_pill": 1})
    ok(st == 200 and j["clamped"] is False, "one qi pill consumed is never clamped")
    ok(abs(j["player"]["cultivation"] - claim) < 0.01, "pill qi lands in full")

    # control: same claim with NO pill spent gets clamped
    server.PLAYERS["pill_user"]["cultivation"] = 100
    server.PLAYERS["pill_user"]["last_seen"] = time.time()
    st, j = sync("pill_user", cultivation=claim,
                 inventory={"spirit_meal": 3, "qi_pill": 1})
    ok(st == 200 and j["clamped"] is True, "same claim without spending a pill is clamped")
    ok(j["player"]["cultivation"] < claim, "clamped cultivation stays below the claim")

    # ============ 8. blatant cheat ============
    fresh("cheater", cultivation=100)
    st, j = sync("cheater", cultivation=999999)
    ok(st == 200 and j["clamped"] is True, "blatant qi cheat is flagged clamped")
    ok(j["player"]["cultivation"] < 1000, "blatant qi cheat is cut back to legit")

    # ============ 9. equipment / inventory / elixir validation ============
    # The item DB is being rebuilt one item at a time, so this exercises the
    # slot rules against whatever items exist now: the seed consumables.
    fresh("gear_valid")
    st, j = sync("gear_valid",
                 equipment={"head": "qi_pill", "chest": "bogus_crown",
                            "ring1": "spirit_meal", "boots": "bogus_crown"},
                 inventory={"spirit_meal": 100000, "bogus_item": 9,
                            "qi_pill": "many", "healing_pill": 4},
                 elixirs=["qi_pill", "qi_pill", "spirit_meal", "healing_pill"])
    eq = j["player"]["equipment"]
    ok(st == 200 and eq.get("head") is None, "wrong-slot item rejected server-side")
    ok(all(v is None for v in eq.values()), "no item equips into a slot it doesn't belong to")
    ok(eq.get("boots") is None, "unknown gear rejected")
    inv = j["player"]["inventory"]
    ok(inv.get("healing_pill") is None, "removed item dropped from inventory")
    ok(inv.get("spirit_meal") == 9999, "item counts clamp to 9999")
    ok("bogus_item" not in inv and "qi_pill" not in inv, "unknown / non-numeric items dropped")
    ok(j["player"]["elixirs"] == ["qi_pill", None, "spirit_meal"],
       "elixirs dedup to 3 named slots")

    st, j = sync("gear_valid", inventory={"spirit_meal": -2})
    ok(j["player"]["inventory"].get("spirit_meal") == 0, "negative counts clamp to zero")

    # ============ 10. dao insight is monotonic ============
    fresh("insight_sage", cultivation=0, dao_insight=5)
    st, j = sync("insight_sage", dao_insight=7)
    ok(st == 200 and j["player"]["dao_insight"] == 7, "condensed insight is accepted")
    st, j = sync("insight_sage", dao_insight=3)
    ok(j["player"]["dao_insight"] == 7, "older insight never rolls progress back")

    # ============ 11. sync response never echoes hp ============
    fresh("hp_hidden")
    server.PLAYERS["hp_hidden"]["hp"] = 555
    st, j = sync("hp_hidden")
    ok(st == 200 and "hp" not in j["player"], "sync response never echoes hp")
finally:
    srv.shutdown()
    srv.server_close()

print("\n%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
