# Changelog

All notable changes to Ashen Fantasy are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
versioning follows [Semantic Versioning](https://semver.org/).

Policy: every code update must add an entry here and bump the version
(`server.py` `server_version`, footer in `public/index.html`), then commit
and push to `main` on https://github.com/itzRealEzra/ashen-fantasy.

## [Unreleased]

## [0.3.1] - 2026-10-16
### Fixed
- Topbar realm now shows the realm only ("Mortal", "Qi Refinement Realm I"
  ... "Qi Refinement Realm X"); the layer detail ("· Layer N") stays in the
  Cultivate and Character panels.

## [0.3.0] - 2026-10-16
### Added
- New realm ladder: Mortal (major tribulation breakthrough) -> Qi Refinement
  I-X with 10 minor layers each (101 stages), gentle x1.06 cost curve,
  bottleneck grind on realm ascents, Dao Insight condensation at the peak.
### Fixed
- New characters showed "REALM:-": the topbar realm is now set on entering
  the main game and kept in sync by every cultivate panel refresh.
- Qi overflow: gains may exceed the bar; breakthroughs consume only the
  stage cost and surplus carries into the next stage (client + `/api/sync`).
### Changed
- Sidebar starts closed and auto-hides on every panel switch; hamburger
  starts in the collapsed (gold, rotated) state.

## [0.2.0] - 2026-10-16
### Added
- Idle cultivation: passive Qi every second (`1.0 x root x realm x mode`),
  live rate display and breakthrough ETA in the Cultivate panel.
- Offline gains: capped at 8h at 50% efficiency with a welcome-back summary.
- 13-stage realm ladder (Qi Refining I-IX, Foundation I-III, Golden Core I),
  served as single source of truth via `GET /api/realms`, with per-stage
  costs, rate multipliers, and flavor lines.
- Breakthrough depth: bottleneck grinding (insight attempts costing 25% Qi),
  major-realm tribulations (endure 2 of 3 calamities: thunder/heart/body),
  and Dao Insight condensation at the Golden Core peak.
- Closed-door Seclusion mode: x2 Qi rate while battle is forbidden.
- Server sync (`POST /api/sync` every 30s + on tab hide): authoritative
  snapshot with rate-cap anti-cheat clamping; players persist across
  restarts (`players.json` loaded at boot); `GET /api/player` added.
### Changed
- Meditate is now a burst supplement with a 5s cooldown instead of the
  primary Qi source; milestone log lines replace per-action spam.

## [0.1.4] - 2026-10-15
### Changed
- Sidebar is now an overlay above the canvas: it slides in/out with
  translate + fade (with shadow and focus-safe hiding) while `.content`
  keeps its full size and never stretches. Applies on desktop and mobile.

## [0.1.3] - 2026-10-15
### Changed
- Removed the "MAIN GAME OPEN SIDE BAR MENU" placeholder header; the game
  shell now starts directly with the topbar.
- Sidebar open/close is animated: smooth width slide + fade on desktop,
  height collapse + fade on mobile; hamburger icon rotates and turns gold
  when the sidebar is closed.

## [0.1.2] - 2026-10-15
### Changed
- True full-screen layout with no dead space: screens are full-bleed
  (`100vw` x `100dvh`, zero outer padding/margins), Reroll Root Panel and
  Main Game shell stretch edge to edge; side columns widened
  (280px / 1fr / 300px) to fill 1920px widths.

## [0.1.1] - 2026-10-15
### Fixed
- Viewport layout now fits 1920x1080 with no page scroll: screens lock to
  `100dvh`, Reroll Root Panel and Main Game shell use flex column with
  internal scrolling only (roll list, detail, index, content, logs).
- Widened layout container to 1920px; fixed roll stage height; added
  `viewport-fit=cover` to the viewport meta.

## [0.1.0] - 2026-10-15
### Added
- Core game flow: Enter Username -> Select Spiritual Roots -> Main Game.
- Python stdlib-only server (`server.py`): static hosting + JSON API
  (`GET /api/roots`, `POST /api/roll`, `POST /api/create`).
- Spiritual Root system: 21 roots across 6 rarity tiers
  (Mortal 45% / Earth 25% / Heaven 15% / Immortal 8% / Divine 5% / Primordial 2%)
  with weighted 9-roll, pick-3 foundation, and same-element synergy bonus.
- Reroll Root Panel UI: selected-root detail/stats, animated roll stage,
  9x root name + rarity rows, reroll button, full root index with chances.
- Main Game shell: topbar (menu, name, realm, qi), sidebar
  (Character / Cultivate / Battle), Cultivate default panel with
  Meditate/Breakthrough, Character sheet, Battle prototype.
- Dark Wuxia theme (`public/css/style.css`), vanilla JS client (`public/js/app.js`).
