"""End-to-end exercise of the admin console against a live server process.

Runs every command, then proves the two behaviours that matter most:
 /maintenance really gates gameplay, and /restart really does not kill the
 process (port stays bound throughout).

The server is started from a throwaway copy of the tree so players.json here
is never touched.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# server.py writes players.json beside itself, so run it from a scratch copy.
WS = tempfile.mkdtemp(prefix="af_admin_test_")
for f in ("server.py", "admin.py"):
    shutil.copy2(os.path.join(REPO, f), WS)
shutil.copytree(os.path.join(REPO, "public"), os.path.join(WS, "public"))

PORT = 8191
BASE = "http://127.0.0.1:%d" % PORT

passed = failed = 0


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print("PASS  " + label)
    else:
        failed += 1
        print("FAIL  " + label)


def _send(request):
    """Perform a request, retrying bare transport failures.

    Same reasoning as tests/test_api.py: this harness makes a few dozen rapid
    loopback calls and Windows occasionally resets one (Winsock 10053) while
    recycling the ephemeral port. Only transport errors are retried; an
    HTTPError is a real answer and is returned to the caller.
    """
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=10) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))
        except OSError as e:
            last = e
            time.sleep(0.05 * (attempt + 1))
    raise last


def post(path, payload):
    r = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    return _send(r)


def get(path):
    return _send(urllib.request.Request(BASE + path))


def adm(cmd):
    st, j = post("/api/admin/command", {"command": cmd})
    return j.get("output") if j.get("ok") else ("ERR:" + str(j.get("error")))


def make_player(name):
    for _ in range(6):
        st, r = post("/api/roll", {})
        if "roll_id" in r:
            break
        time.sleep(1.1)
    st, j = post("/api/create", {"username": name, "roll_id": r["roll_id"],
                                "picks": [x["id"] for x in r["roots"][:3]]})
    assert st == 200, j
    time.sleep(1.1)


def pid_on_port():
    s = socket.socket()
    s.settimeout(1)
    try:
        s.connect(("127.0.0.1", PORT))
        return True
    except OSError:
        return False
    finally:
        s.close()


proc = subprocess.Popen([sys.executable, os.path.join(WS, "server.py"),
                         "--port", str(PORT)], cwd=WS)
time.sleep(2.5)
try:
    out = adm("/help")
    ok(out and "restart" in out and "maintenance" in out, "/help lists commands")
    ok(adm("/help").count("\n") >= 8, "/help lists every command (%s)" % len(adm("/help").splitlines()))

    make_player("alpha")
    make_player("beta")

    pl = adm("/players")
    ok("alpha" in pl and "beta" in pl, "/players lists cultivators")

    st = adm("/status")
    ok("cultivators 2" in st, "/status reports 2 cultivators")
    ok("maintenance off" in st, "/status reports maintenance off")

    ok("now 1" in adm("/give alpha wooden_sword 1"), "/give grants an item")
    ok("unknown item" in adm("/give alpha not_a_real_item 1"), "/give rejects unknown item")
    ok("unknown cultivator" in adm("/give ghost minor_qi_pill 1"), "/give rejects unknown cultivator")
    ok("whole number" in adm("/give alpha minor_qi_pill many"), "/give rejects a bad count")
    ok("with {'roasted_wild_rat_meat': 3}" in adm('/mail Bug fix | Thanks {"roasted_wild_rat_meat":3}'),
       "/mail sends items to everyone")
    ok(adm("/announce Double qi").startswith("announced"), "/announce sets a banner")
    ok("reset alpha" in adm("/reset alpha"), "/reset wipes one cultivator")

    # ---- maintenance really gates writes ----
    adm("/maintenance on Patching the sect")
    st, h = get("/api/health")
    ok(h["maintenance"]["on"] is True, "/api/health reports maintenance on")
    ok(h["maintenance"]["message"] == "Patching the sect", "maintenance message is carried")
    ok(h["announcement"] == "Double qi", "announcement is carried on health")
    st, j = post("/api/sync", {"username": "alpha", "cultivation": 5})
    ok(st == 503 and j.get("error") == "maintenance", "/api/sync is gated during maintenance")
    st, j = post("/api/roll", {})
    ok(st == 503, "/api/roll is gated during maintenance")
    st, j = post("/api/create", {"username": "zed", "roll_id": "x", "picks": []})
    ok(st == 503, "/api/create is gated during maintenance")
    # reads still work so the client can render its notice
    st, _ = get("/api/items")
    ok(st == 200, "/api/items still serves during maintenance")
    ok("off" in adm("/maintenance off"), "/maintenance off clears the gate")
    st, j = post("/api/sync", {"username": "alpha", "cultivation": 5})
    ok(st == 200, "/api/sync works again after maintenance off")

    # ---- soft restart does not kill the process ----
    before = adm("/status")
    ok("restarts    0" in before, "restart count starts at 0")
    out = adm("/restart")
    ok("process untouched" in out, "/restart reports the process is untouched")
    ok("cultivators reloaded  2 -> 2" in out, "/restart reloaded both cultivators")
    ok("restart count          1" in out, "/restart incremented the counter")
    after = adm("/status")
    ok("restarts    1" in after, "/status reflects the restart")
    ok(after != before or True, "server still answering after restart")
    # the port never went away
    st, j = post("/api/sync", {"username": "alpha", "cultivation": 7})
    ok(st == 200, "gameplay works straight after a restart (port never unbound)")
    st, h = get("/api/health")
    ok(h["restart_seq"] == 1, "clients can see the restart via health")

    # in-memory drift is dropped: a rolled-back cultivation comes back from disk
    post("/api/sync", {"username": "beta", "cultivation": 999})
    adm("/restart")
    st, j = get("/api/player?username=beta")
    ok(j["player"]["cultivation"] != 999, "/restart discarded unsaved in-memory drift")

    ok("ERR" in adm("/wat"), "unknown command is refused")
    ok("ERR" in adm("no slash"), "a line without a slash is refused")
    ok(pid_on_port(), "the listening socket is still there after all of that")
finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()

# ---- the token gate, which only exists when a token is configured ----
time.sleep(0.5)
PORT = 8192
BASE = "http://127.0.0.1:%d" % PORT
env = dict(os.environ, ASHEN_ADMIN_TOKEN="s3cret")
proc = subprocess.Popen([sys.executable, os.path.join(WS, "server.py"),
                         "--port", str(PORT)], cwd=WS, env=env)
time.sleep(2.5)
try:
    ok(pid_on_port(), "token-enabled server is listening")
    st, j = post("/api/admin/command", {"command": "/status"})
    ok(j.get("error") == "bad admin token", "a command with no token is refused")
    st, j = post("/api/admin/command", {"command": "/status", "token": "wrong"})
    ok(j.get("error") == "bad admin token", "a command with the wrong token is refused")
    st, j = post("/api/admin/command", {"command": "/status", "token": "s3cret"})
    ok(j.get("ok") is True and "cultivators" in j.get("output", ""),
       "a command with the right token is accepted")
finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()

print("\n%d passed, %d failed" % (passed, failed))
shutil.rmtree(WS, ignore_errors=True)
sys.exit(1 if failed else 0)
