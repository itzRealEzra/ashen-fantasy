"""Ashen Fantasy admin console.

    python admin.py            # talk to a running server (default 127.0.0.1:8000)
    python admin.py --port 8080

This is the single place commands are defined. server.py imports COMMANDS
from here and dispatches them in its own process, which is what lets
/restart do real work without ending the process -- it re-reads the saves and
drops in-memory drift in place, and the port is never unbound.

The terminal is only a front end: it posts to /api/admin/command on the
running server, which routes back through this same table. There is no second
implementation to drift out of sync.

Commands:

    /help                     list commands
    /status                   uptime, players, mail, maintenance, restarts
    /players                  every saved cultivator
    /maintenance [on|off] [message]
                             gate gameplay; the game shows the message
    /restart                  soft restart: reload saves in place, clear
                             rolls and roll cooldowns, rescan art
    /announce <text>          banner shown in the game until cleared
    /mail <subject> | <body> [json items]
                             mail every cultivator, e.g. {"spirit_meal":3}
    /give <player> <item> <n> grant an item straight into a bag
    /reset <player>           wipe one cultivator back to a fresh state
    /quit                     leave the console (the server keeps running)

Admin authority is deliberately not part of the browser client: nothing
shipped to the page can reach these endpoints. They are refused if the
request carries a foreign Origin (see the guard in server.py), and the server
binds 127.0.0.1 by default. Set ASHEN_ADMIN_TOKEN to additionally require a
token on every admin call.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


# --------------------------------------------------------------------------
# Commands. Each handler takes the server module (as `srv`) so it can act on
# live state directly, plus the argument string. Returns text for the console.
# --------------------------------------------------------------------------

def cmd_help(srv, args):
    # COMMANDS maps name -> (handler, help text).
    return "\n".join(
        "%-12s %s" % (name, meta[1]) for name, meta in COMMANDS.items())


def cmd_status(srv, args):
    up = int(time.time() - srv.STARTED_AT)
    mail = sum(len(p.get("mail") or []) for p in srv.PLAYERS.values())
    unread = sum(srv._mail_unread(p) for p in srv.PLAYERS.values())
    maint = "ON" if srv.MAINTENANCE["on"] else "off"
    if srv.MAINTENANCE["on"] and srv.MAINTENANCE.get("message"):
        maint += ' -- "%s"' % srv.MAINTENANCE["message"]
    return (
        "version     %s (client %s)\n"
        "uptime      %dh %02dm %02ds\n"
        "cultivators %d\n"
        "mail        %d messages, %d unread\n"
        "roll state  %d open, %d ip cooldowns\n"
        "restarts    %d (last %s)\n"
        "maintenance %s"
        % (srv.SERVER_VERSION, srv.CLIENT_VERSION, up // 3600, (up % 3600) // 60,
           up % 60, len(srv.PLAYERS), mail, unread, len(srv.ROLLS),
           len(srv.LAST_ROLL_BY_IP), srv.RESTART_SEQ,
           time.strftime("%H:%M:%S", time.localtime(srv.RESTARTED_AT))
           if srv.RESTARTED_AT else "never", maint))


def cmd_players(srv, args):
    if not srv.PLAYERS:
        return "no cultivators saved."
    rows = sorted(srv.PLAYERS.items(), key=lambda kv: kv[1].get("username", ""))
    out = []
    for _, p in rows:
        mail = len(p.get("mail") or [])
        unread = srv._mail_unread(p)
        out.append("%-16s %-24s qi %-10.1f mail %d%s"
                   % (p.get("username", "?"), p.get("realm", "?"),
                      float(p.get("cultivation", 0) or 0), mail,
                      " (%d unread)" % unread if unread else ""))
    return "\n".join(out)


def cmd_maintenance(srv, args):
    parts = args.split(None, 1)
    if not parts:
        return "maintenance is %s" % ("ON" if srv.MAINTENANCE["on"] else "off")
    mode = parts[0].lower()
    msg = parts[1].strip() if len(parts) > 1 else ""
    if mode in ("on", "true", "yes", "1"):
        srv.MAINTENANCE.update(on=True, message=msg or
                               "The heavens are quiet. Returning shortly.",
                               since=time.time())
        return "maintenance ON -- gameplay endpoints are gated: %s" % srv.MAINTENANCE["message"]
    if mode in ("off", "false", "no", "0"):
        srv.MAINTENANCE.update(on=False, message="", since=None)
        return "maintenance off -- gameplay is open."
    return "usage: /maintenance [on|off] [message]"


def cmd_restart(srv, args):
    """Soft restart. No process is killed and the port is never unbound."""
    before = len(srv.PLAYERS)
    srv.PLAYERS.clear()
    loaded = srv.load_players()
    rolls = len(srv.ROLLS)
    ips = len(srv.LAST_ROLL_BY_IP)
    srv.ROLLS.clear()
    srv.LAST_ROLL_BY_IP.clear()
    srv._apply_art(srv._asset_cache())
    srv.RESTART_SEQ += 1
    srv.RESTARTED_AT = time.time()
    srv.save_players()
    srv.ANNOUNCEMENT.update(
        text="Server restarted. State reloaded at %s."
             % time.strftime("%H:%M:%S", time.localtime()),
        at=srv.RESTARTED_AT)
    return (
        "soft restart complete (process untouched, still pid %d)\n"
        "  cultivators reloaded  %d -> %d\n"
        "  rolls cleared          %d\n"
        "  ip cooldowns cleared   %d\n"
        "  art rescanned          %d items, %d icons\n"
        "  restart count          %d"
        % (os.getpid(), before, loaded, rolls, ips, len(srv.ITEMS),
           len(srv.icons_map()), srv.RESTART_SEQ))


def cmd_announce(srv, args):
    text = args.strip()
    if not text:
        srv.ANNOUNCEMENT.update(text="", at=0)
        return "announcement cleared."
    srv.ANNOUNCEMENT.update(text=text, at=time.time())
    return "announced: %s" % text


def cmd_mail(srv, args):
    if "|" not in args:
        return 'usage: /mail <subject> | <body> [{"spirit_meal":3}]'
    subject, rest = args.split("|", 1)
    subject = subject.strip()
    rest = rest.strip()
    items = {}
    tail = ""
    if "{" in rest and rest.rstrip().endswith("}"):
        body, _, blob = rest.rpartition("{")
        body = body.rstrip()
        try:
            items = {k: int(v) for k, v in json.loads("{" + blob).items()}
        except ValueError:
            return "items must be valid json, e.g. {\"spirit_meal\":3}"
    else:
        body = rest
    if not subject:
        return "subject required."
    sent = 0
    for name in list(srv.PLAYERS):
        srv._deliver(srv.PLAYERS[name],
                     srv._new_mail("maintenance", subject, body or subject, items))
        sent += 1
    srv.save_players()
    return "mailed %r to %d cultivator(s)%s" % (
        subject, sent, (" with %s" % items) if items else "")


def cmd_give(srv, args):
    bits = args.split()
    if len(bits) < 3:
        return "usage: /give <player> <item_id> <count>"
    name, item_id, raw = bits[0], bits[1], bits[2]
    p = srv.PLAYERS.get(name)
    if not p:
        return "unknown cultivator %r" % name
    if item_id not in srv.ITEM_BY_ID:
        return "unknown item %r (try /items)" % item_id
    try:
        n = max(1, int(raw))
    except ValueError:
        return "count must be a whole number."
    inv = p.setdefault("inventory", {})
    inv[item_id] = max(0, min(int(inv.get(item_id, 0)) + n, 9999))
    srv.save_players()
    return "gave %d x %s to %s (now %d)" % (n, srv.ITEM_BY_ID[item_id]["name"],
                                            name, inv[item_id])


def cmd_items(srv, args):
    if not args.strip():
        return "\n".join("%-24s %-11s %s" % (i["id"], i["kind"], i["name"])
                         for i in sorted(srv.ITEMS, key=lambda x: x["id"]))
    q = args.strip().lower()
    return "\n".join("%-24s %-11s %s" % (i["id"], i["kind"], i["name"])
                     for i in srv.ITEMS if q in i["id"].lower() or q in i["name"].lower())


def cmd_reset(srv, args):
    name = args.strip()
    if not name:
        return "usage: /reset <player>"
    p = srv.PLAYERS.get(name)
    if not p:
        return "unknown cultivator %r" % name
    p["realm"] = srv.REALMS[0]["name"]
    p["realm_idx"] = 0
    p["cultivation"] = 0
    p["cultivation_to_next"] = srv.REALMS[0]["cost"]
    p["bottleneck"] = 0
    p["dao_insight"] = 0
    p["spirit_stones"] = 0
    p["mastery"] = {t: 0 for t in srv.MASTERY_TRACKS}
    p["equipment"] = {s: None for s in srv.EQUIP_SLOTS}
    p["inventory"] = {}
    p["elixirs"] = [None, None, None]
    p["hp"] = None
    p["last_seen"] = time.time()
    srv.save_players()
    return "reset %s back to Mortal with an empty bag." % name


COMMANDS = {
    "/help": (cmd_help, "list commands"),
    "/status": (cmd_status, "uptime, players, mail, maintenance, restarts"),
    "/players": (cmd_players, "list every saved cultivator"),
    "/maintenance": (cmd_maintenance, "on|off [message] -- gate gameplay"),
    "/restart": (cmd_restart, "soft restart: reload saves, clear rolls"),
    "/announce": (cmd_announce, "<text> -- banner in the game ('' clears)"),
    "/mail": (cmd_mail, "<subject> | <body> [json items] -- mail everyone"),
    "/give": (cmd_give, "<player> <item_id> <count>"),
    "/items": (cmd_items, "[filter] -- list item ids"),
    "/reset": (cmd_reset, "<player> -- wipe one cultivator"),
}


def dispatch(srv, line):
    """Run one command line against the server module. Used by both the HTTP
    endpoint and anything else that wants the same behaviour."""
    line = (line or "").strip()
    if not line:
        return False
    name, _, rest = line.partition(" ")
    if not name.startswith("/"):
        return False, "commands start with / -- try /help"
    handler = COMMANDS.get(name.lower())
    if not handler:
        return False, "unknown command %r -- try /help" % name
    try:
        return True, handler[0](srv, rest)
    except Exception as exc:  # a bad command must not take the server down
        return False, "%s failed: %s: %s" % (name, type(exc).__name__, exc)


# --------------------------------------------------------------------------
# Terminal console
# --------------------------------------------------------------------------

BANNER = """Ashen Fantasy admin console. Commands run against the live server in
its own process -- /restart reloads state without killing it. /help for the
list, /quit to leave the server running."""


def main():
    ap = argparse.ArgumentParser(description="Ashen Fantasy admin console.")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--token", default=os.environ.get("ASHEN_ADMIN_TOKEN", ""))
    args = ap.parse_args()
    base = "http://%s:%d/api/admin/command" % (args.host, args.port)

    print(BANNER)
    print("connected to %s\n" % base)
    while True:
        try:
            line = input("af> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nleaving the server running.")
            return 0
        if not line:
            continue
        if line in ("/quit", "/exit", "/q"):
            print("leaving the server running.")
            return 0
        payload = json.dumps({"command": line, "token": args.token}).encode("utf-8")
        req = urllib.request.Request(base, data=payload,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                out = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                out = json.loads(e.read().decode("utf-8"))
            except ValueError:
                print("admin endpoint returned HTTP %d -- is the server running?"
                      % e.code)
                continue
        except urllib.error.URLError:
            print("cannot reach the server at %s -- is it running?" % base)
            continue
        if out.get("error"):
            print(out["error"])
        else:
            print(out.get("output", ""))


if __name__ == "__main__":
    sys.exit(main())
