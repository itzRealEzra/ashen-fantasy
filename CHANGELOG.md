# Changelog

All notable changes to Ashen Fantasy are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
versioning follows [Semantic Versioning](https://semver.org/).

Policy: every code update must add an entry here and bump the version
(`server.py` `server_version`, `CLIENT_VERSION` in `public/js/app.js`,
footer in `public/index.html`), then commit
and push to `main` on https://github.com/itzRealEzra/ashen-fantasy.

## [Unreleased]

## [0.7.8] - 2026-10-16
### Fixed
- Elixir loadout deduplicated everywhere, not just on load: normalize
  heals legacy saves (e.g. Healing Pill in all 4 slots) and `/api/sync`
  enforces one slot per consumable server-side. Gear needs no dedup —
  equipping consumes from the stack, so two identical rings are two real
  rings.

## [0.7.7] - 2026-10-16
### Fixed
- Bag tooltips are state-aware: an equipped item with nothing left to
  equip now offers Unequip (with the right slot) instead of a misleading
  Equip; bag clicks follow the same rule.

## [0.7.6] - 2026-10-16
### Changed
- Consumable tooltips now offer Use + Equip (loading an elixir slot is
  equipping it) instead of Use + Elixir.
- Tooltip shows the item type value again (armor/consumable/materials),
  still without the old Type:/Info: labels.

## [0.7.5] - 2026-10-16
### Changed
- Tooltip trimmed to name + rarity, description, stats, and actions —
  Type/Info rows removed and the duplicated effect line is gone
  (descriptions already state the effect).

## [0.7.4] - 2026-10-16
### Changed
- Tooltip layout per spec: name + rarity header, type line (armor /
  consumable / materials), info block, then action buttons.
- Tooltips now appear only where actions exist (bag gear/consumables,
  equipped slots, loaded elixirs) — materials show none.
- Equipped doll slots tooltip an Unequip button; elixir slots tooltip
  Use + Unload.

## [0.7.3] - 2026-10-16
### Fixed
- Tooltips usable again: the tip element now loads before the script so its
  buttons actually wire up (previously the boot wiring silently no-opped,
  leaving dead buttons and a tooltip that always timed out).
- Tooltip wiring is lazy and idempotent, same-item hovers no longer
  re-render the buttons mid-click, and the slot-to-tip grace is 350ms.

## [0.7.2] - 2026-10-16
### Added
- Tooltips are now interactive: hover an item, slide onto the tooltip, and
  use Equip / Use / Elixir buttons right inside it; it hides on hover-out.
### Changed
- Inspect detail box removed; bag clicks act directly (gear equips,
  consumables are used with a waste guard at full HP).
- Loading an elixir already slotted elsewhere moves it instead of
  duplicating it across slots.
### Fixed
- `invSel` selection state fully retired with the detail box.

## [0.7.1] - 2026-10-16
### Added
- Gear rarity (Mortal/Earth/Heaven/Immortal by tier) with rarity-colored
  hover tooltips, including live stat comparison vs the equipped piece
  (green/red deltas, "click to equip" hint).
### Changed
- Inventory fills the tab with no dead space (bag grid scrolls internally).
- Bag gear equips on click; consumables/materials still open the detail box.
- Inspect placeholder removed — the detail box only renders when an item
  with actions is selected.
- Bag tabs are square-cornered like the rest of the UI.
- New characters no longer start with a loaded elixir (pills stay in bag).
### Fixed
- Equipping the last of a stack clears a stale detail selection.

## [0.7.0] - 2026-10-16
### Added
- Inventory + Equipment tab: paper-doll with head/sec weapon/chest, main
  weapon/core/arm, back/boots/legs, 2 rings/necklace/headpiece, and 4
  quick-use elixir slots; bag with All/Gear/Consumable/Materials tabs and
  an inspect/equip/use detail box.
- 91-item database via `GET /api/items` (48 gear pieces across 4 tiers,
  3 consumables, 40 materials); gear stats feed Character and Battle.
- Gear and pill drops merged into hunting loot; kills also fill the bag.
- Consumables: Healing Pill, Qi Pill, Spirit Meal; loadable into elixir
  slots, usable from the bag.
- Persistent HP: fights start at current HP, damage sticks between hunts,
  slow recovery outside combat, full revive on defeat, starter healing kit.

## [0.6.2] - 2026-10-16
### Changed
- Attack log removed from combat; kills and drops stay visible via the
  kill counter and loot log.
- Searching indicator reserves its slot, so appearing/disappearing no
  longer stretches the canvas.
- Attack bars glide via CSS transition instead of stepping each tick.

## [0.6.1] - 2026-10-16
### Added
- Client/server version handshake: `/api/health` reports the server
  version and the client shows a plain-language banner (instead of a bare
  console 404) when the server is unreachable or older than the client.
### Fixed
- `/favicon.ico` now answers 204 instead of serving the app shell.

## [0.6.0] - 2026-10-16
### Added
- Full battle system: Battle -> realm-gated area list (mockup 1) -> enemy
  select with loot previews (mockup 2) -> auto-combat (mockup 3).
- 4 hunting areas x 5 mobs via `GET /api/areas` (Misty Mortal Valley through
  Frostbite Peaks), with per-mob HP/attack/defense/speed, loot tables, and
  Qi rewards.
- Auto-attack bars (player fills in 1s); crits use Character stats; red HP
  bars, attack log, and a persistent aggregated loot log (`Iron 2x` style)
  that is never cleared.
- Kill cycle: enemy dies -> loot drops -> "searching for that same enemy"
  pause -> same enemy respawns; player death force-leaves to enemy select.
### Changed
- Server sync headroom raised to cover battle Qi rewards.

## [0.5.1] - 2026-10-16
### Changed
- Character panel Qi now ticks live every second instead of only on panel
  refreshes.
- Top-bar Qi counter removed (Qi lives in the Cultivate and Character
  panels now).
### Fixed
- Dantian glow recentered on the art: it follows the same 4.1px optical
  nudge as the character, and the image width no longer resolves against
  its own container.

## [0.5.0] - 2026-10-16
### Added
- Character panel now shows derived combat stats (HP, Qi + rate, Attack,
  Defense, Crit chance, Crit dmg) scaling with root foundation and realm.
### Changed
- Breakthrough button reserves its space while hidden (visibility instead
  of display), so the canvas no longer jumps when it appears.
- Raw internal stats (root multipliers, comprehension/physique/fortune sums)
  removed from the Character panel.

## [0.4.4] - 2026-10-16
### Fixed
- Character centering fine-tuned with a 4.1px optical nudge on the art.

## [0.4.3] - 2026-10-16
### Changed
- Cultivate event message line removed for a cleaner panel.
- Character figure explicitly centered (flex + auto margins, block image).
- Dantian glow is smaller (56px) but brighter: hot core, screen blending,
  tighter halo, same nonstop pulse and qi ring.

## [0.4.2] - 2026-10-16
### Added
- Dantian glow over the meditating figure's lower abdomen: warm radial
  pulse plus a slow rotating qi ring, glowing nonstop.
- Breakthrough button stays hidden until the stage threshold is truly met
  (full bar and bottleneck satisfied), then rises in with an animation.
- Cultivate event line now slides in and fades out after ~4 seconds.
### Changed
- UI labels use first-letter casing (Name, Realm, Breakthrough, sidebar
  and panel headings); the character art itself is static again.

## [0.4.1] - 2026-10-16
### Added
- Cultivate panel rebuilt per mockup with provided art: meditating
  character (`assets/character/character_0_meditating.png`, gentle hover
  animation) over the cultivation backdrop (`assets/background/cultivation_panel.png`),
  wide Qi progress bar, `+X/s Qi` rate line, boxed BREAKTHROUGH button, and
  a single-line event message replacing the scrolling log.
### Removed
- Meditate button (pure idle now) and the Seclusion mode + Emerge button;
  battle lock and rate multiplier retired with them.

## [0.4.0] - 2026-10-16
### Changed
- Realm ladder collapsed to 11 stages: Mortal (major tribulation) then Qi
  Refinement Realm I-X, one realm per breakthrough — no more minor layers.
  Costs scale x1.6 per realm (50 -> ~5,498 Qi), bottleneck grinding gates
  Realms VI, VIII, and IX, peak Realm X condenses Dao Insight.

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
