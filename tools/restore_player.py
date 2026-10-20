"""Rebuild players.json from a browser localStorage `af_player` value.

The save file is gitignored and was overwritten, but the game mirrors the
whole player object into localStorage on every sync, so a browser that still
has the profile can restore it.

How to get the value:
  1. DO NOT reload the game in that browser yet -- loading can overwrite it.
  2. Open DevTools (F12) -> Application -> Local Storage -> http://127.0.0.1:8000
  3. Find the `af_player` entry, copy its VALUE (the JSON object, not the key)
  4. Save it to a file, e.g. asd.json
  5. python tools/restore_player.py asd.json

Passing --list makes it print what is in players.json right now instead.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

PLAYERS_FILE = os.path.join(ROOT, "players.json")


def load_current():
    try:
        with open(PLAYERS_FILE, encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def restore(path):
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)

    name = str(data.get("username") or "").strip()
    if not server.USERNAME_RE.match(name):
        sys.exit("That file has no usable 'username' field: %r" % (name,))

    players = load_current()
    if name in players:
        print("Refusing to overwrite existing cultivator %r." % name)
        print("Current contents: %s" % ", ".join(sorted(players)) or "(empty)")
        sys.exit("Move the file aside first, or hand-edit it.")

    # Fill in anything the browser copy predates.
    player = dict(data)
    player["username"] = name
    player.setdefault("mail", [])
    player.setdefault("patch_version", server.SERVER_VERSION)
    player.setdefault("equipment", {s: None for s in server.EQUIP_SLOTS})
    player.setdefault("inventory", {})
    player.setdefault("elixirs", [None, None, None])
    player.setdefault("spirit_stones", 0)
    player.setdefault("roots", [])
    player.setdefault("stats", {})
    player["hp"] = None  # client-tracked; never restored from disk
    player.setdefault("last_seen", server.time.time())

    players[name] = player
    with open(PLAYERS_FILE, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, indent=2)
    print("Restored %r (realm %r) into players.json." % (name, player.get("realm")))
    print("Now holds: %s" % ", ".join(sorted(players)))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--list":
        print(json.dumps(load_current(), ensure_ascii=False, indent=2))
    elif len(sys.argv) > 1:
        restore(sys.argv[1])
    else:
        sys.exit(__doc__)
