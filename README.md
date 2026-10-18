# Ashen Fantasy

A text-based cultivation RPG. The client is vanilla JS (`public/`), the
server is Python stdlib only (`server.py`) — no `pip install`, no build step.

## Requirements

- **Python 3** — runs entirely on the standard library.
- **Node.js** — only needed to run the client test suite.

## Run the game

```bash
python server.py
```

Then open <http://127.0.0.1:8000> in a browser.

Options: `python server.py --port 8080 --host 127.0.0.1`

The server serves the game from `public/` and the JSON API under `/api/*`.
Progress is saved to `players.json` (local, gitignored).

## Admin console

A separate terminal for live commands. The server keeps running; nothing here
restarts or kills it.

```bash
python admin.py            # talks to 127.0.0.1:8000
python admin.py --port 8080
```

```
af> /maintenance on Patching the sect
af> /mail Double qi weekend | Two days of doubled qi. {"qi_pill":3}
af> /restart
af> /quit
```

| Command | Does |
| --- | --- |
| `/help` | list commands |
| `/status` | uptime, players, mail, maintenance, restart count |
| `/players` | every saved cultivator |
| `/maintenance [on\|off] [message]` | gate gameplay; the game shows a banner |
| `/restart` | soft restart: reload saves in place, clear rolls and roll cooldowns, rescan art |
| `/announce <text>` | banner in the game, `''` clears it |
| `/mail <subject> \| <body> [json]` | mail every cultivator, e.g. `{"spirit_meal":3}` |
| `/give <player> <item_id> <n>` | grant an item straight into a bag |
| `/items [filter]` | list item ids |
| `/reset <player>` | wipe one cultivator back to a fresh state |

`/restart` does **not** end the process. It re-reads `players.json`, drops
in-memory drift, clears `ROLLS` and `LAST_ROLL_BY_IP`, rescans art and bumps a
counter that the client reads from `/api/health` — so the port is never
unbound and connected clients simply pick up the fresh state.

`admin.py` is the single command table: the server imports it and dispatches
in its own process, while the terminal posts to it. There is no second
implementation to drift.

Admin authority is not part of the browser client. The endpoint refuses
requests carrying a foreign `Origin` and anything not from `127.0.0.1`, and
setting `ASHEN_ADMIN_TOKEN` requires a token on every call:

```bash
set ASHEN_ADMIN_TOKEN=some-secret
python admin.py --token some-secret
```

## Tests

Run the suites from the repository root:

```bash
node tests/test_client.js    # client logic (extracts real functions from public/js/app.js)
python tests/test_api.py     # server API (runs in-process; never touches players.json)
python tools/test_admin.py   # admin console against a live server, in a temp copy of the tree
```

Each prints a pass/fail summary and exits non-zero on failure.

## Versioning

Every code update bumps the version in three places (`server.py`
`server_version`, `CLIENT_VERSION` in `public/js/app.js`, the footer in
`public/index.html`), adds a `CHANGELOG.md` entry, then commits and pushes
to `main`.
