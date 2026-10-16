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

## Tests

Run both suites from the repository root:

```bash
node tests/test_client.js   # client logic (extracts real functions from public/js/app.js)
python tests/test_api.py    # server API (runs in-process; never touches players.json)
```

Each prints a pass/fail summary and exits non-zero on failure.

## Versioning

Every code update bumps the version in three places (`server.py`
`server_version`, `CLIENT_VERSION` in `public/js/app.js`, the footer in
`public/index.html`), adds a `CHANGELOG.md` entry, then commits and pushes
to `main`.
