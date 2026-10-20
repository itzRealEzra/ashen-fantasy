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


def _send(request):
    """Perform a request, retrying bare transport failures.

    The suite opens ~150 loopback connections back to back, and Windows
    intermittently resets one of them (Winsock 10053, seen in roughly a quarter
    of runs) as the ephemeral port is recycled. That is an OS/connection-level
    event, not a server fault: no HTTP status ever arrives, so there is nothing
    to assert on. A real client (the browser) retries this itself; the harness
    has to as well. Only transport errors are retried -- an HTTPError is a real
    answer from the server and is handed straight back to the caller.
    """
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=5) as resp:
                return resp.status, resp.read(), dict(resp.headers)
        except urllib.error.HTTPError as e:
            return e.code, e.read(), dict(e.headers)
        except OSError as e:
            # urllib wraps connection resets in URLError, and URLError is an
            # OSError, so this covers ConnectionResetError, RemoteDisconnected,
            # ConnectionAbortedError (Winsock 10053) and socket timeouts alike.
            last = e
            time.sleep(0.05 * (attempt + 1))
    raise last


def req(path, payload=None):
    url = "http://127.0.0.1:%d%s" % (PORT, path)
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    r = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    st, raw, _ = _send(r)
    return st, json.loads(raw.decode("utf-8"))


def roll():
    """Roll nine roots, retrying past the 1s cooldown.

    _send may retry the request after a transport reset, and a retried roll
    that the server already processed comes back 429 with no roll_id. Clearing
    the cooldown before each attempt makes a repeat harmless.
    """
    st, j = 0, {}
    for attempt in range(4):
        server.LAST_ROLL_BY_IP.clear()  # tests may roll faster than players can
        st, j = req("/api/roll", {})
        if "roll_id" in j:
            return st, j
        time.sleep(0.05 * (attempt + 1))
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
    # The build number lives in the SERVER_VERSION constant (server_version on
    # the Handler is built from it), so read the constant rather than a literal.
    v_srv = re.search(r'^SERVER_VERSION = "([\d.]+)"', srv_src, re.M).group(1)
    v_js = re.search(r'CLIENT_VERSION = "([\d.]+)"', js_src).group(1)
    v_html = re.search(r'Ashen Fantasy v([\d.]+)', html_src).group(1)
    ok(v_srv == v_js == v_html, "server/client/footer versions match (%s)" % v_srv)
    ok(server.SERVER_VERSION == v_srv, "SERVER_VERSION constant matches the source")
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
    # Art comes from assets/items/<id>.png, or from a declared icons/ override
    # for the handful of items whose picture lives with the UI icons.
    def art_ok(i):
        if i["img"] == "/assets/items/%s.png" % i["id"]:
            return True
        over = server._ITEM_ICON_FILES.get(i["id"])
        return bool(over) and i["img"] == "/assets/icons/%s.png" % over
    ok(all(art_ok(i) for i in with_art),
       "item art path comes from the item id or a declared icons/ override")
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
    fresh("pill_user", cultivation=100, inventory={"roasted_wild_rat_meat": 3, "minor_qi_pill": 2})
    cost0 = server.REALMS[0]["cost"]
    claim = 100 + cost0 * 0.15
    st, j = sync("pill_user", cultivation=claim,
                 inventory={"roasted_wild_rat_meat": 3, "minor_qi_pill": 1})
    ok(st == 200 and j["clamped"] is False, "one qi pill consumed is never clamped")
    ok(abs(j["player"]["cultivation"] - claim) < 0.01, "pill qi lands in full")

    # control: same claim with NO pill spent gets clamped
    server.PLAYERS["pill_user"]["cultivation"] = 100
    server.PLAYERS["pill_user"]["last_seen"] = time.time()
    st, j = sync("pill_user", cultivation=claim,
                 inventory={"roasted_wild_rat_meat": 3, "minor_qi_pill": 1})
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
                 equipment={"head": "minor_qi_pill", "chest": "bogus_crown",
                            "ring1": "roasted_wild_rat_meat", "boots": "bogus_crown"},
                 inventory={"roasted_wild_rat_meat": 100000, "bogus_item": 9,
                            "minor_qi_pill": "many", "minor_vitality_elixir": 4},
                 elixirs=["minor_qi_pill", "minor_qi_pill", "roasted_wild_rat_meat", "minor_vitality_elixir"])
    eq = j["player"]["equipment"]
    ok(st == 200 and eq.get("head") is None, "wrong-slot item rejected server-side")
    ok(all(v is None for v in eq.values()), "no item equips into a slot it doesn't belong to")
    ok(eq.get("boots") is None, "unknown gear rejected")
    inv = j["player"]["inventory"]
    ok(inv.get("qi_pill") is None, "removed item dropped from inventory")
    ok(inv.get("roasted_wild_rat_meat") == 9999, "item counts clamp to 9999")
    ok("bogus_item" not in inv and "minor_qi_pill" not in inv, "unknown / non-numeric items dropped")
    ok(j["player"]["elixirs"] == ["minor_qi_pill", None, "roasted_wild_rat_meat"],
       "elixirs dedup to 3 named slots")

    st, j = sync("gear_valid", inventory={"roasted_wild_rat_meat": -2})
    ok(j["player"]["inventory"].get("roasted_wild_rat_meat") == 0, "negative counts clamp to zero")

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

    # ============ 12. realm_idx must be earned ============
    fresh("skipper")
    st, j = sync("skipper", realm_idx=10, cultivation=10 ** 9)
    ok(j["player"]["realm_idx"] == 0,
       "realm skip refused: fresh cultivator claiming realm 10 stays Mortal")
    ok(j["clamped"] is True, "inflated qi alongside a realm jump is flagged clamped")

    fresh("honest_1")
    server.PLAYERS["honest_1"]["cultivation"] = server.REALMS[0]["cost"] + 5
    st, j = sync("honest_1", realm_idx=1, cultivation=5)
    ok(j["player"]["realm_idx"] == 1, "an affordable breakthrough still succeeds")

    fresh("honest_2")
    st, j = sync("honest_2", realm_idx=2, cultivation=0)
    ok(j["player"]["realm_idx"] == 0,
       "multi-realm jump refused when qi cannot pay every stage on the way")

    fresh("honest_3")
    server.PLAYERS["honest_3"]["cultivation"] = (
        server.REALMS[0]["cost"] + server.REALMS[1]["cost"] + 7)
    st, j = sync("honest_3", realm_idx=2, cultivation=7)
    ok(j["player"]["realm_idx"] == 2,
       "multi-realm jump allowed when qi covers each stage (surplus carries)")

    # a realm_idx at or below the stored one is untouched by the guard
    fresh("hold_high")
    server.PLAYERS["hold_high"]["realm_idx"] = 4
    server.PLAYERS["hold_high"]["cultivation"] = 0
    st, j = sync("hold_high", realm_idx=2, cultivation=0)
    ok(j["player"]["realm_idx"] == 4, "a lower claim never demotes a stored realm")

    # the peak realm is never left
    fresh("peak")
    server.PLAYERS["peak"]["cultivation"] = 10 ** 9
    st, j = sync("peak", realm_idx=len(server.REALMS) - 1, cultivation=10 ** 9)
    ok(j["player"]["realm_idx"] == len(server.REALMS) - 1,
       "the peak realm is reachable with enough qi")
    st, j = sync("peak", realm_idx=len(server.REALMS), cultivation=10 ** 9)
    ok(j["player"]["realm_idx"] == len(server.REALMS) - 1,
       "realm_idx past the ladder still clamps to the last stage")

    # ============ 13. cross-origin requests are refused ============
    # The game ships from this same origin, so no browser should ever be
    # sending a foreign Origin to /api/*. These are the requests a page on
    # another site could otherwise make against a local server.
    def req_origin(path, payload=None, origin=None, ctype="application/json", method=None):
        url = "http://127.0.0.1:%d%s" % (PORT, path)
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": ctype}
        if origin:
            headers["Origin"] = origin
        r = urllib.request.Request(url, data=data, headers=headers, method=method)
        st, raw, hd = _send(r)
        return st, json.loads(raw.decode("utf-8")), hd

    EVIL = "http://evil.example.com"
    fresh("victim")
    st, j, hd = req_origin("/api/player?username=victim", origin=EVIL)
    ok(st == 403, "cross-origin read of a save is refused")
    st, j, hd = req_origin("/api/sync", {"username": "victim", "realm_idx": 10}, origin=EVIL)
    ok(st == 403, "cross-origin write to /api/sync is refused")
    st, j, hd = req_origin("/api/sync", {"username": "victim", "realm_idx": 10},
                           origin=EVIL, ctype="text/plain")
    ok(st == 403, "cross-origin simple request (text/plain, no preflight) is refused")
    st, j, hd = req_origin("/api/roll", {}, origin=EVIL)
    ok(st == 403, "cross-origin roll is refused")
    ok(server.PLAYERS["victim"]["realm_idx"] == 0,
       "the refused write left the save untouched")

    # same-origin requests still work, and non-browser clients still work
    st, j, hd = req_origin("/api/player?username=victim", origin="http://127.0.0.1:%d" % PORT)
    ok(st == 200, "same-origin read is allowed")
    st, j, hd = req_origin("/api/player?username=victim", origin=None)
    ok(st == 200, "no-Origin read (curl / native client) is allowed")

    st, j, hd = req_origin("/api/health")
    ok("Access-Control-Allow-Origin" not in hd, "no ACAO header on API responses")
    st, j, hd = req_origin("/api/items")
    ok("Access-Control-Allow-Origin" not in hd, "no ACAO header on item responses")

    # preflight gets nothing to negotiate
    r = urllib.request.Request("http://127.0.0.1:%d/api/sync" % PORT, method="OPTIONS")
    pstatus, _, pheaders = _send(r)
    ok(pstatus == 403, "OPTIONS preflight is refused outright")
    ok("Access-Control-Allow-Origin" not in pheaders, "preflight grants no origin")

    # ============ 14. roll state is pruned, not accumulated ============
    server.ROLLS.clear()
    server.LAST_ROLL_BY_IP.clear()
    now = time.time()
    server.ROLLS["stale"] = {"offer": [], "expires": now - 1, "ip": "1.2.3.4"}
    server.ROLLS["live"] = {"offer": [], "expires": now + 300, "ip": "1.2.3.4"}
    server.LAST_ROLL_BY_IP["1.2.3.4"] = now - server.ROLL_IP_TTL - 10
    server.LAST_ROLL_BY_IP["5.6.7.8"] = now
    server.prune_roll_state(now)
    ok("stale" not in server.ROLLS, "expired roll is dropped")
    ok("live" in server.ROLLS, "unexpired roll is kept")
    ok("1.2.3.4" not in server.LAST_ROLL_BY_IP, "stale roll cooldown is dropped")
    ok("5.6.7.8" in server.LAST_ROLL_BY_IP, "recent roll cooldown is kept")

    server.ROLLS.clear()
    server.LAST_ROLL_BY_IP.clear()
    for i in range(50):
        server.ROLLS["r%d" % i] = {"offer": [], "expires": now - 1, "ip": "x"}
    server.prune_roll_state(now)
    ok(len(server.ROLLS) == 0, "a full batch of expired rolls is fully reclaimed")

    ok(server.max_affordable_realm(0, 0, len(server.REALMS) - 1) == 0,
       "no qi means no breakthrough")
    ok(server.max_affordable_realm(server.REALMS[0]["cost"], 0, len(server.REALMS) - 1) == 1,
       "exactly the stage cost buys exactly one breakthrough")

    # ============ 15. mail: read / claim rules ============
    def mail_get(username):
        return req("/api/mail?username=" + username)

    def mail_post(path, username, mid=None, **extra):
        body = {"username": username}
        if mid:
            body["id"] = mid
        body.update(extra)
        return req(path, body)

    fresh("mailer")
    st, j = mail_get("mailer")
    ok(st == 200 and j["ok"] is True, "GET /api/mail serves a mailbox")
    starter = [m for m in j["mail"] if m["kind"] == "starter"]
    ok(len(starter) == 1, "a new cultivator is mailed the starter pack")
    sm = starter[0]

    # ---- the pack contents. Written out in full rather than derived from
    # STARTER_PACK, so an accidental edit to the pack fails a test.
    expected_pack = {
        # common armour set, one per slot
        "wooden_sword", "wooden_shield", "leather_helmet", "leather_chest",
        "leather_leggings", "leather_bracers", "leather_boots", "leather_cape",
        # the slots the first set left empty
        "cracked_qi_stone", "chipped_jade_pendant", "copper_spirit_ring",
        "jade_guard_ring", "qi_gathering_ring", "cloth_headband",
        # supplies: one per elixir slot
        "minor_vitality_elixir", "minor_qi_pill", "roasted_wild_rat_meat",
    }
    ok(set(sm["items"]) == expected_pack,
       "starter pack holds all %d entries" % len(expected_pack))
    ok(all(i in server.ITEM_BY_ID for i in sm["items"]), "every pack item exists in the item db")
    pack_gear = {i for i in sm["items"] if server.ITEM_BY_ID[i]["kind"] == "gear"}
    # "ring" is a gear slot that maps onto the two ring fingers, so it is not
    # itself a member of EQUIP_SLOTS.
    def slot_is_wearable(sl):
        return sl in server.EQUIP_SLOTS or sl == "ring"
    ok(all(slot_is_wearable(server.ITEM_BY_ID[i]["slot"]) for i in pack_gear),
       "every pack gear item equips into a real slot")
    ok(all(server.ITEM_BY_ID[i]["rarity"] in server.ITEM_RARITY_ORDER for i in sm["items"]),
       "every pack item has a valid rarity")
    ok(server.ITEM_BY_ID["jade_guard_ring"]["rarity"] == "Uncommon",
       "the better ring is the one Uncommon piece in the pack")
    # Both elixir shapes that were unfilled must now have a named pill, and
    # heal-only must map to the slot that was empty before.
    def shape(u):
        if u.get("heal_pct") and u.get("qi_pct"): return "both"
        if u.get("heal_pct"): return "heal"
        if u.get("qi_pct"): return "qi"
        return ""
    first_of = {}
    for c in server.CONSUMABLES:
        first_of.setdefault(shape(c["use"]), c["id"])
    ok(first_of.get("heal") == "minor_vitality_elixir",
       "the heal-only elixir slot is named Minor Vitality Elixir")
    ok(first_of.get("qi") == "minor_qi_pill", "the qi-only slot is named Minor Qi Pill")
    ok(first_of.get("both") == "roasted_wild_rat_meat",
       "the restorative slot is named Roasted Wild Rat Meat")
    ok(len(first_of) == 3 and "" not in first_of,
       "all three elixir slots have a named consumable and none is neutral")
    ok(all(shape(server.ITEM_BY_ID[i]["use"]) for i in sm["items"]
           if server.ITEM_BY_ID[i]["kind"] == "consumable"),
       "every consumable in the pack has a real effect")
    covered = {server.ITEM_BY_ID[i]["slot"] for i in pack_gear}
    ok(len(covered) == 12, "the pack covers 12 distinct equip slots (got %d)" % len(covered))
    ok({"main_weapon", "sec_weapon", "head", "chest", "core", "arm", "back",
        "boots", "legs", "necklace", "ring", "headpiece"} <= covered,
       "the pack still covers every slot it set out to")
    ok(server.ITEM_BY_ID["cloth_headband"]["slot"] == "headpiece",
       "Cloth Headband sits in the Immortal Crown / Artifact slot, not head")
    ok(server.ITEM_BY_ID["leather_helmet"]["slot"] == "head",
       "the helmet keeps the head slot")

    # ---- the read rule: items stay unread until claimed
    ok(sm["read"] is False and sm["claimed"] is False, "item mail arrives unread and unclaimed")
    st, j = mail_post("/api/mail/read", "mailer", sm["id"])
    ok(st == 200 and j["held"] is True, "viewing item mail reports it is held")
    ok(j["mail"]["read"] is False, "viewing item mail does NOT mark it read")
    ok(j["unread"] == 1, "unread badge still counts held mail")
    ok(not server.PLAYERS["mailer"]["inventory"], "viewing grants nothing")

    # ---- claiming is what settles it
    st, j = mail_post("/api/mail/claim", "mailer", sm["id"])
    ok(st == 200 and j["ok"] is True, "claim succeeds")
    ok(set(j["granted"]) == expected_pack,
       "claim grants every entry in the pack")
    ok(j["mail"]["read"] is True and j["mail"]["claimed"] is True,
       "claiming marks the mail read and claimed")
    ok(j["unread"] == 0, "claiming clears the unread count")
    inv = j["inventory"]
    ok(all(inv.get(i) == n for i, n in server.STARTER_PACK.items()),
       "claimed items land in the bag with their listed counts")

    # ---- claim exactly once
    st, j = mail_post("/api/mail/claim", "mailer", sm["id"])
    ok(st == 400, "a second claim is refused")
    inv2 = server.PLAYERS["mailer"]["inventory"]
    ok(all(inv2.get(i) == n for i, n in server.STARTER_PACK.items()),
       "the refused claim granted nothing extra")

    # ---- plain mail has nothing to open, so it is read on arrival
    fresh("plainmail")
    st, j = mail_get("plainmail")
    pm = [m for m in j["mail"] if m["kind"] == "starter"]
    st, j = mail_post("/api/mail/claim", "plainmail", pm[0]["id"])
    st, j = req("/api/mail/maintenance",
                {"subject": "Downtime apology", "body": "Twenty minutes of downtime."})
    ok(st == 200 and j["sent"] >= 1, "maintenance endpoint mails every cultivator")
    st, j = mail_get("plainmail")
    mt = [m for m in j["mail"] if m["kind"] == "maintenance"]
    ok(len(mt) == 1, "the maintenance mail arrived")
    ok(mt[0]["subject"] == "Downtime apology", "maintenance mail keeps its subject")
    ok(mt[0]["items"] == {}, "a reward with no items is a plain mail")
    ok(mt[0]["read"] is True, "plain mail is read on arrival (nothing to open)")
    st, j = mail_get("plainmail")
    ok(j["unread"] == 0, "a read plain mail does not badge")

    # a maintenance reward that DOES carry items behaves like any attachment
    st, j = req("/api/mail/maintenance",
                {"subject": "Bug bounty", "items": {"roasted_wild_rat_meat": 3}})
    st, j = mail_get("plainmail")
    bounty = [m for m in j["mail"] if m["kind"] == "maintenance" and m["subject"] == "Bug bounty"]
    ok(bounty and bounty[0]["read"] is False, "a reward with items arrives unread")
    ok(bounty and bounty[0]["items"].get("roasted_wild_rat_meat") == 3, "reward items are recorded")
    st, j = mail_post("/api/mail/read", "plainmail", bounty[0]["id"])
    ok(j["mail"]["read"] is False, "reward with items stays unread until claimed")
    st, j = mail_post("/api/mail/claim", "plainmail", bounty[0]["id"])
    # plainmail already claimed the starter pack, so the reward adds to it.
    expect = server.STARTER_PACK.get("roasted_wild_rat_meat", 0) + 3
    ok(j["unread"] == 0 and j["inventory"].get("roasted_wild_rat_meat") == expect,
       "reward claim pays out on top of what the player already held")

    # ---- unknown mail / cultivator
    st, j = mail_post("/api/mail/read", "mailer", "nope")
    ok(st == 404, "unknown mail id is a 404")
    st, j = mail_post("/api/mail/claim", "mailer", "nope")
    ok(st == 404, "claiming an unknown mail is a 404")
    st, j = req("/api/mail?username=ghost_here")
    ok(st == 404, "mail for an unknown cultivator is a 404")

    # ---- mail cannot smuggle in items that do not exist
    st, j = req("/api/mail/maintenance",
                {"subject": "Bad items", "items": {"not_a_real_item": 5, "roasted_wild_rat_meat": 1}})
    ok("not_a_real_item" not in (j.get("items") or {}), "unknown items are dropped from mail")
    st, j = req("/api/mail/maintenance", {"body": "no subject"})
    ok(st == 400, "maintenance mail requires a subject")

    # ---- a cultivator born on this build gets no retroactive patch note
    st, j = mail_get("mailer")
    kinds = {m["kind"] for m in j["mail"]}
    ok("patch" not in kinds, "a new cultivator gets no patch note for the build they started on")

    # an older save gets exactly one, and only once
    server.PLAYERS["mailer"]["patch_version"] = "0.0.1"
    st, j = mail_get("mailer")
    ok(len([m for m in j["mail"] if m["kind"] == "patch"]) == 1, "an outdated save is mailed one patch note")
    st, j = mail_get("mailer")
    ok(len([m for m in j["mail"] if m["kind"] == "patch"]) == 1, "the patch note is not repeated")
    ok(server.PLAYERS["mailer"]["patch_version"] == server.SERVER_VERSION,
       "patch_version advances to the current build")

    # ---- the mailbox is capped, and never eats an unclaimed reward
    server.PLAYERS["mailer"]["mail"] = []
    for n in range(server.MAIL_MAX + 20):
        server._deliver(server.PLAYERS["mailer"], server._new_mail("maintenance", "old %d" % n, "x"))
    held = server._new_mail("starter", "valuable", "x", server.STARTER_PACK)
    server._deliver(server.PLAYERS["mailer"], held)
    box = server.PLAYERS["mailer"]["mail"]
    ok(len(box) == server.MAIL_MAX, "the mailbox is capped at MAIL_MAX")
    ok(held in box, "an unclaimed reward survives the cap")
    kept = [m["subject"] for m in box]
    ok("old 0" not in kept, "the oldest read mail is trimmed first")
    ok("old 69" in kept, "the newest mail is kept")
    ok(len([m for m in box if not m["claimed"]]) == 1,
       "trimming never drops unclaimed mail")

    # ---- mail is server-held: it is not client-settable through /api/sync
    server.PLAYERS["mailer"]["mail"] = []
    server._deliver(server.PLAYERS["mailer"], server._new_mail("starter", "server mail", "x",
                                                               {"roasted_wild_rat_meat": 1}))
    before = len(server.PLAYERS["mailer"]["mail"])
    sync("mailer", mail=[{"id": "fake", "items": {"wooden_sword": 99}, "claimed": False}])
    ok(len(server.PLAYERS["mailer"]["mail"]) == before, "/api/sync cannot inject or rewrite mail")
    ok(server.PLAYERS["mailer"]["mail"][0]["id"] != "fake", "a forged mail id is not stored")

    # ============ 16. UI icon art ============
    st, j = req("/api/icons")
    ok(st == 200 and j.get("ok") is True, "GET /api/icons serves the icon map")
    icons = j.get("icons") or {}
    ok(len(icons) > 0, "icons discovered on disk (%d)" % len(icons))
    ok(all(v.startswith("/assets/icons/") and v.endswith(".png")
           for v in icons.values()), "every icon maps to an icons/ png path")
    ok(all("/" not in k for k in icons), "icon keys are bare file names, not paths")

    # every slot the client draws an icon for must actually have a file
    want_slots = {"head": "helmet_icon", "sec_weapon": "secondary_weapon_icon",
                  "chest": "body_armor_icon", "main_weapon": "main_weapon_icon",
                  "core": "cultivation_artifact_icon", "arm": "arm_armor_icon",
                  "back": "cloak_cape_icon", "boots": "foot_armor_icon",
                  "legs": "leg_armor_icon", "ring1": "spirit_ring_icon",
                  "ring2": "spirit_ring_icon", "necklace": "jade_pendant_icon",
                  "headpiece": "crown_artifact_icon"}
    ok(set(want_slots) == set(server.EQUIP_SLOTS),
       "a slot icon is mapped for every equip slot (%d)" % len(server.EQUIP_SLOTS))
    missing_slots = {s: n for s, n in want_slots.items() if n not in icons}
    ok(not missing_slots, "every equip-slot icon file exists (%s)" % (missing_slots or "none missing"))
    want_tabs = ["character_icon", "cultivate_icon", "battle_icon",
                 "inventory_icon", "mail_icon", "elixir_icon"]
    ok(all(t in icons for t in want_tabs),
       "tab and elixir icon files exist (%s)" % [t for t in want_tabs if t not in icons])

    # items declared to draw from icons/ actually resolve there
    st, j = req("/api/items")
    by_id = {i["id"]: i for i in j["items"]}
    for iid, icon in server._ITEM_ICON_FILES.items():
        ok(iid in by_id and by_id[iid].get("img") == "/assets/icons/%s.png" % icon,
           "%s draws its art from icons/%s" % (iid, icon))
    # Fallback contract, stated so it does not depend on which art files happen
    # to exist on disk: an item with no matching file carries no img key at
    # all, and the client then renders the item's emoji glyph. Probed with a
    # synthetic id rather than a real item, since art gets added over time.
    probe = dict(server.ITEM_BY_ID["wooden_sword"])
    probe["id"] = "no_such_art_file"
    server.ITEMS.append(probe)
    try:
        server._apply_art(server._asset_cache())
        ok("img" not in probe, "an item with no art file carries no img key (glyph fallback)")
        have = [i["id"] for i in server.ITEMS if i.get("img")]
        ok(all("img" in server.ITEM_BY_ID[i] for i in have),
           "every item that resolved art really has an img key")
    finally:
        server.ITEMS.remove(probe)

    # Art from assets/icons is white line art; art from assets/items is a
    # colour illustration. The server flags the difference so the client can
    # dim the former instead of rendering it as a solid white blob.
    for iid, icon in server._ITEM_ICON_FILES.items():
        it = by_id[iid]
        ok(it.get("lineArt") is True, "%s is flagged lineArt (icons/ art)" % iid)
        ok(it["img"].startswith("/assets/icons/"), "%s draws from icons/" % iid)
    colour_art = [i for i in j["items"]
                  if i.get("img") and i["img"].startswith("/assets/items/")]
    ok(colour_art and all("lineArt" not in i for i in colour_art),
       "items/ colour art is never flagged lineArt (%d checked)" % len(colour_art))
finally:
    srv.shutdown()
    srv.server_close()

print("\n%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
